/** Copyright © 2022 Synopsys, Inc.
 *
 * All rights reserved
 */

import { CoverityApiService } from 'synopsys-sig-node'
import { Gitlab } from '@gitbeaker/node'
import { CommentSchema } from '@gitbeaker/core/dist/types/resources/Commits'

// TODO: to be replaced with paging
const LIMIT = 300

const coverityUrl = process.env.COV_CONNECT_URL
const coverityCredentials = process.env.COV_CREDENTIALS
const coverityProject = process.env.COV_PROJECT
const gitlabUrl = process.env.CI_SERVER_URL
const gitlabToken = process.env.MK_WEBGOAT_API_TOKEN
const projectId = process.env.CI_PROJECT_ID
const commitSha = process.env.CI_COMMIT_SHA

const coverityUser = coverityCredentials.split(/[:]/)[0]
const coverityPass = coverityCredentials.split(/[:]/)[1]

const coverityApi = new CoverityApiService(coverityUrl, coverityUser, coverityPass);
const gitlabApi = new Gitlab({host: gitlabUrl, token: gitlabToken})

interface ImpactDistribution {
    high?: number,
    medium?: number,
    low?: number,
    audit?: number
}

/**
 * Get issues detected by Coverity, count issues per impact and return the number of each impact
 */
async function getCoverityIssues(): Promise<ImpactDistribution> {
    let impacts: ImpactDistribution = {}
    const results = await coverityApi.findIssues(coverityProject, 0, LIMIT)
    if (results.totalRows === undefined || results.totalRows === 0)
        return Promise.reject(impacts)
    let countHigh = 0
    let countMedium = 0
    let countLow = 0
    let countAudit = 0
    for (let issues of results.rows) {
        for (let issue of issues) {
            if (issue.key === 'displayImpact' && issue.value === 'High')
                countHigh++;
            else if (issue.key === 'displayImpact' && issue.value === 'Medium')
                countMedium++
            else if (issue.key === 'displayImpact' && issue.value === 'Low')
                countLow++
            else if (issue.key === 'displayImpact' && issue.value === 'Audit')
                countAudit++
            else
                continue
        }
    }
    impacts = {
        high: countHigh,
        medium: countMedium, 
        low: countLow,
        audit: countAudit
    }
    return Promise.resolve(impacts)
}
/**
 * Update the given commit with a new comment which holds the number of the issues per impact
 */
async function gitlabUpdateExistingReviewComment(impacts: ImpactDistribution): Promise<CommentSchema> {
    const commentHeader = '# Test Header by coverity-result-check.ts\n'
    const impactHigh = '## Number of Impact High Issues: ' + impacts.high + '\n'
    const impactMedium = '## Number of Impact Medium Issues: ' + impacts.medium + '\n'
    const impactLow = '## Number of Impact Low Issues: ' + impacts.low + '\n'
    const impactAudit = '## Number of Impact Audit Issues: ' + impacts.audit + '\n'
    const comment = commentHeader + impactHigh + impactMedium + impactLow + impactAudit
    const res = await gitlabApi.Commits.createComment(projectId, commitSha, comment)  
    if (res.note === undefined || res.note === '')
        return Promise.reject(res)
    return Promise.resolve(res)
}

getCoverityIssues()
    .then (impacts => {
        console.log('Number of High Impact Issue: ' + impacts.high)
        console.log('Number of Medium Impact Issue: ' + impacts.medium)
        console.log('Number of Low Impact Issue: ' + impacts.low)
        console.log('Number of Audit Impact Issue: ' + impacts.audit)
        gitlabUpdateExistingReviewComment(impacts)
            .then (response => {
                console.log('Comment is added to commit')
            })
            .catch (response => {
                console.log('Error to add comment to commit')
                process.exit(1)
            })
    })
    .catch (impacts => {
        console.log('Error to get Coverity results')
        process.exit(1)
    }) 
