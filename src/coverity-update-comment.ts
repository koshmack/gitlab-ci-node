/** Copyright © 2022 Synopsys, Inc.
 *  All rights reserved
 */

import { CoverityApiService } from 'synopsys-sig-node'
import { CommentSchema } from '@gitbeaker/core/dist/types/resources/Commits'
import { gitlabUpdateExistingReviewComment, gitlabGetExistingReviewComment } from 'synopsys-sig-node'
import assert from 'assert'

const LIMIT = 100

const COVERITY_URL = process.env.COV_CONNECT_URL
const COVERITY_CREDS = process.env.COV_CREDENTIALS
const COVERITY_PROJECT = process.env.COV_PROJECT
const GITLAB_URL = process.env.CI_SERVER_URL
const GITLAB_PJ_TOKEN = process.env.MK_WEBGOAT_API_TOKEN
const GITLAB_PROJECT_ID = process.env.CI_PROJECT_ID
const GITLAB_COMMIT_SHA = process.env.CI_COMMIT_SHA
const COVERITY_ISSUEFILE_PATH = process.env.COV_ISSUEFILE_PATH

interface ImpactDistribution {
    high?: number,
    medium?: number,
    low?: number,
    audit?: number
}

/**
 * Get issues detected by Coverity, count issues per impact and return the number of each impact
 */
async function getCoverityIssues(coverityUrl: string, coverityCreds: string,
                                 coverityProject: string): Promise<ImpactDistribution> {
    const coverityUser = coverityCreds.split(/[:]/)[0]
    const coverityPass = coverityCreds.split(/[:]/)[1]

    const coverityApi = new CoverityApiService(coverityUrl, coverityUser, coverityPass);    

    let countHigh = 0
    let countMedium = 0
    let countLow = 0
    let countAudit = 0

    let offset = 0
    let totalReceived = 0

    while (true) {
        const results = await coverityApi.findIssues(coverityProject, offset, LIMIT)
        if (results.totalRows === undefined || results.totalRows === 0) {
            throw new Error('No results could be received for Coverity project: ' + COVERITY_PROJECT)
        }

        for (let issues of results.rows) {
            for (let issue of issues) {
                if (issue.key === 'displayImpact' && issue.value === 'High') {
                    countHigh++;
                } else if (issue.key === 'displayImpact' && issue.value === 'Medium') {
                    countMedium++
                } else if (issue.key === 'displayImpact' && issue.value === 'Low') {
                    countLow++
                } else if (issue.key === 'displayImpact' && issue.value === 'Audit') {
                    countAudit++
                } else {
                    continue
                }
            }
        }

        totalReceived += LIMIT
        if (totalReceived >= results.totalRows) break
        offset += LIMIT
    }

    let impacts: ImpactDistribution = {
        high: countHigh,
        medium: countMedium, 
        low: countLow,
        audit: countAudit
    }
    return Promise.resolve(impacts)
}

/**
 * Get the array of the commit comments
 */
async function getGitlabCommitComment(gitlabUrl: string, gitlabToken: string, gitlabProjectId: string,
                                       gitlabCommitSha: string): Promise<CommentSchema[]> {
    try {
        const res = await gitlabGetExistingReviewComment(gitlabUrl, gitlabToken, gitlabProjectId, gitlabCommitSha)
        return Promise.resolve(res)
    } catch (error) {
        if (error instanceof Error) console.log(error.message)
        throw error
    }
}

/**
 * Update the given commit with a new comment which holds the number of the issues per impact
 */
async function updateGitlabCommitComment(gitlabUrl: string, gitlabToken: string, gitlabProjectId: string,
                                         gitlabCommitSha: string, impacts: ImpactDistribution): Promise<CommentSchema> {
    const commentHeader = '# Test Header by coverity-update-comment.ts\n'
    // TODO to replace general coverity link with link to the 'relevant view + project'
    const coverityLink = '## [Link to Coverity Instance](' + COVERITY_URL + ')\n'
    const impactHigh = '## Number of Impact High Issues: ' + impacts.high + '\n'
    const impactMedium = '## Number of Impact Medium Issues: ' + impacts.medium + '\n'
    const impactLow = '## Number of Impact Low Issues: ' + impacts.low + '\n'
    const impactAudit = '## Number of Impact Audit Issues: ' + impacts.audit + '\n'
    const comment = commentHeader + coverityLink + impactHigh + impactMedium + impactLow + impactAudit
    try {
        const res = await gitlabUpdateExistingReviewComment(gitlabUrl, gitlabToken, gitlabProjectId, gitlabCommitSha, comment)
        return Promise.resolve(res)
    } catch (error) {
        if (error instanceof Error) console.log(error.message)
        throw error
    }
}

assert(typeof COVERITY_URL === 'string')
assert(typeof COVERITY_CREDS === 'string')
assert(typeof COVERITY_PROJECT === 'string')
assert(typeof GITLAB_URL === 'string')
assert(typeof GITLAB_PJ_TOKEN === 'string')
assert(typeof GITLAB_PROJECT_ID === 'string')
assert(typeof GITLAB_COMMIT_SHA === 'string')
assert(typeof COVERITY_ISSUEFILE_PATH === 'string')

getCoverityIssues(COVERITY_URL, COVERITY_CREDS, COVERITY_PROJECT)
.then (impacts => {
    console.log('Number of High Impact Issue: ' + impacts.high)
    console.log('Number of Medium Impact Issue: ' + impacts.medium)
    console.log('Number of Low Impact Issue: ' + impacts.low)
    console.log('Number of Audit Impact Issue: ' + impacts.audit)
    return updateGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA, impacts)
}).then (res => {
    console.log('Comment was successfully updated to the commit')
    return getGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA)
}).then (res => {
    console.log('Comment for the commit was successfully received')
}).catch (error => {
    if (error instanceof Error) {
        console.log('Exception occured. ' + error.message)
    } else {
        console.log('Exception occured in checking coverity issues')
    }
})
