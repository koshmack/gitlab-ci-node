import { CommentSchema } from '@gitbeaker/core/dist/types/resources/Commits'
import { readFileSync } from 'fs'
import { gitlabUpdateExistingReviewComment, gitlabGetExistingReviewComment } from 'synopsys-sig-node'
import assert from 'assert'

const COVERITY_URL = process.env.COV_CONNECT_URL
const GITLAB_URL = process.env.CI_SERVER_URL
const GITLAB_PJ_TOKEN = process.env.MK_WEBGOAT_API_TOKEN
const GITLAB_PROJECT_ID = process.env.CI_PROJECT_ID
const GITLAB_COMMIT_SHA = process.env.CI_COMMIT_SHA
const COVERITY_FILE_PATH = process.env.MK_COVFILE_PATH

interface ImpactDistribution {
    high?: number,
    medium?: number,
    low?: number,
    audit?: number
}

/**
 * Read coverity result file and count issues per impact and return the number of each impact
 */
function checkCoverityIssues(coverityFilePath: string): ImpactDistribution {
    let rows: string
    try {
        rows = (readFileSync(coverityFilePath)).toString()
    } catch (error) {
        if (error instanceof Error) console.log(error.message)
        throw error
    }

    const countHigh = (rows.match(/displayImpact: High/g) || []).length
    const countMedium = (rows.match(/displayImpact: Medium/g) || []).length
    const countLow = (rows.match(/displayImpact: Low/g) || []).length
    const countAudit = (rows.match(/displayImpact: Audit/g) || []).length

    let impacts: ImpactDistribution = {
        high: countHigh,
        medium: countMedium, 
        low: countLow,
        audit: countAudit
    }
    return impacts
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
    const commentHeader = '# Test Header by coverity-result-check.ts\n'
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
assert(typeof GITLAB_URL === 'string')
assert(typeof GITLAB_PJ_TOKEN === 'string')
assert(typeof GITLAB_PROJECT_ID === 'string')
assert(typeof GITLAB_COMMIT_SHA === 'string')
assert(typeof COVERITY_FILE_PATH === 'string')

let impacts: ImpactDistribution = {}
try {
    impacts = checkCoverityIssues(COVERITY_FILE_PATH)
    console.log('Number of High Impact Issue: ' + impacts.high)
    console.log('Number of Medium Impact Issue: ' + impacts.medium)
    console.log('Number of Low Impact Issue: ' + impacts.low)
    console.log('Number of Audit Impact Issue: ' + impacts.audit)
} catch (error) {
    if (error instanceof Error) {
        console.log('Exception occured. ' + error.message)
    } else {
        console.log('Exception occured in checking coverity issues')
    }
}

updateGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA, impacts)
.then (res => {
    console.log('Comment was successfully updated to the commit')
    // It is redundant but let's get the uploaded GitLab comment for demo purpose
    return getGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA)
}).then (res => {
    console.log('Comment for the commit was successfully received')
}).catch (error => {
    if (error instanceof Error) {
        console.log('Exception occured. ' + error.message)
    } else {
        console.log('Exception occured in handling GitLab comment')
    }
})
