/** Copyright © 2022 Synopsys, Inc.
 *  All rights reserved
 */ 

import { BlackduckApiService, logger } from 'synopsys-sig-node'
import { CommentSchema } from '@gitbeaker/core/dist/types/resources/Commits'
import { IRestResponse } from 'typed-rest-client/RestClient'
import { gitlabUpdateExistingReviewComment, gitlabGetExistingReviewComment } from 'synopsys-sig-node'
import assert from 'assert'
 
const LIMIT = 100
// from GitLab CI Variables 
const BD_URL = process.env.BD_URL
const BD_API_TOKEN = process.env.BD_API_TOKEN
const BD_PROJECT = process.env.BD_PROJECT
const BD_PROJECT_VERSION = `${process.env.BD_PROJECT}-${process.env.CI_PIPELINE_ID}`
const GITLAB_URL = process.env.CI_SERVER_URL
const GITLAB_PJ_TOKEN = process.env.MK_WEBGOAT_API_TOKEN
const GITLAB_PROJECT_ID = process.env.CI_PROJECT_ID
const GITLAB_COMMIT_SHA = process.env.CI_COMMIT_SHA

const BD_API_LIST_PROJECTS = '/api/projects'
const BD_HEADER_PROJECT_DETIAL4 = 'application/vnd.blackducksoftware.project-detail-4+json'
const BD_HEADER_PROJECT_DETIAL5 = 'application/vnd.blackducksoftware.project-detail-5+json'
//const BD_HEADER_COMPONENT_DETAIL = 'application/vnd.blackducksoftware.component-detail-5+json'
const BD_HEADER_BOM_POLICY_STATUS = 'application/vnd.blackducksoftware.bill-of-materials-6+json'
const BD_VERSIONS = 'versions'
const BD_VERSION_RISK_PROFILE = 'version-risk-profile'
const BD_POLICY_STATUS = 'policy-status'

interface IBdItemArray<Type> {
    totalCount: number,
    items:      Array<Type>
}

interface IBdProjectLinkArray<IBdMetaLinks> {
    name:  string
    _meta: {
        links: Array<IBdMetaLinks>
    }
}

interface IBdVersionLinkArray<IBdMetaLinks> {
    versionName:  string
    _meta: {
        links: Array<IBdMetaLinks>
    }
}

interface IBdMetaLinks {
    rel: string,
    href: string
}

interface IBdVersionRiskProfile<IBdRiskDistribution> {
    categories: {
        VULNERABILITY: IBdRiskDistribution,
        OPERATIONAL: IBdRiskDistribution,
        LICENSE: IBdRiskDistribution,
        VERSION: IBdRiskDistribution,
        ACTIVITY: IBdRiskDistribution
    }
}

interface IBdRiskDistribution {
    HIGH: number,
    MEDIUM: number,
    LOW: number,
    OK: number,
    UNKNOWN: number,
    CRITICAL: number
}

interface IBdPolicyViolationStatus {
    componentVersionStatusCounts: [
        {
            name: string,
            value: number
        }
    ]
}

interface IBdPolicyViolationDistribution {
    NOT_IN_VIOLATION: number,
    IN_VIOLATION_OVERRIDDEN: number,
    IN_VIOLATION: number
}

/**
 * Authorization of Black Duck
 * @returns Bearer token
 */
async function bdAuthentication(blackduckApi: BlackduckApiService): Promise<string> {
    try {    
        const bearer = await blackduckApi.getBearerToken()
        return Promise.resolve(bearer)
    } catch (error) {
        if (error instanceof Error) logger.error('Error in bdAuthentication: ' + error.message)
        throw error
    }
}

// TODO: to be moved to blackduck-api.ts
async function getListProjects(blackduckApi: BlackduckApiService, bearerToken: string, offset: number, limit: number):
                               Promise<IRestResponse<IBdItemArray<IBdProjectLinkArray<IBdMetaLinks>>>> {
    const requestUrl = `${BD_URL}${BD_API_LIST_PROJECTS}?offset=${offset}&limit=${limit}`
    const response = await blackduckApi.get<IBdItemArray<IBdProjectLinkArray<IBdMetaLinks>>>
                                               (bearerToken, requestUrl, BD_HEADER_PROJECT_DETIAL4)
    return Promise.resolve(response)
}

// TODO: to be moved to blackduck-api.ts
async function getVersionData(blackduckApi: BlackduckApiService, bearerToken: string, url: string):
                              Promise<IRestResponse<IBdItemArray<IBdVersionLinkArray<IBdMetaLinks>>>> {
    const response = await blackduckApi.get<IBdItemArray<IBdVersionLinkArray<IBdMetaLinks>>>
                                               (bearerToken, url, BD_HEADER_PROJECT_DETIAL5)
    return Promise.resolve(response)
}

// TODO: to be moved to blackduck-api.ts
/**
 * Get project-version href data which matches received project and version names
 * @return project-version href data[] 
 */
async function getProjectVersionData(blackduckApi: BlackduckApiService, bearerToken: string, projectName: string, versionName: string):
                                     Promise<IBdVersionLinkArray<IBdMetaLinks>> {
    let offset = 0
    while (true) {
        try {
            // Search project name unitl the end of the possibly paginated project list 
            let respProj = await getListProjects(blackduckApi, bearerToken, offset, LIMIT)
            if (respProj.statusCode !== 200 || respProj.result === null) {
                throw new Error('Error in getListProjects with status: ' + respProj.statusCode)
            }

            let projectItem = respProj.result.items.find(item => item.name === projectName)
            if (projectItem === undefined) {
                if (offset >= respProj.result.totalCount) {
                    throw new Error('Error searched project name not found!')
                } else {
                    offset += LIMIT
                    continue
                }
            }
            logger.info('Successfully found the project name')

            // Search version name
            let versionLink = projectItem._meta.links.find(link => link.rel === BD_VERSIONS)
            if (versionLink === undefined) throw new Error('Error version URL not found!') 
            const respVersion = await getVersionData(blackduckApi, bearerToken, versionLink.href)
            if (respVersion.statusCode !== 200 || respVersion.result === null) {
                throw new Error('Error in getVersionData with status: ' + respVersion.statusCode)
            }
            logger.info('Successfully received version data')

            const versionItem = respVersion.result.items.find(item => item.versionName == versionName)
            if (versionItem === undefined) throw new Error('Error searched version name not found!') 
            return Promise.resolve(versionItem)  
        } catch (error) {
            if (error instanceof Error) logger.error('Error in getProjectVersionData: ' + error.message)
            throw error
        }
    }
}

async function getVersionRiskProfile(blackduckApi: BlackduckApiService, bearerToken: string,
                                     versionLinkData: IBdVersionLinkArray<IBdMetaLinks>, searchedRisk: string):
                                     Promise<IBdRiskDistribution> {
    let riskProfileLink = versionLinkData._meta.links.find(link => link.rel === BD_VERSION_RISK_PROFILE)
    if (riskProfileLink === undefined) throw new Error('Error link to version risk profile not found!')
    try {
        const response = await blackduckApi.get<IBdVersionRiskProfile<IBdRiskDistribution>>
                                               (bearerToken, riskProfileLink.href, 'application/json')
        if (response.statusCode !== 200 || response.result === null) {
            throw new Error('Error in getVersionRiskProfile with status: ' + response.statusCode)
        }                                                                      
        logger.info('Successfully received version risk profile data')
        let risks = {} as IBdRiskDistribution
        switch (searchedRisk) {
            case 'vulnerability':
                risks = response.result.categories.VULNERABILITY
                break
            case 'operational':
                risks = response.result.categories.OPERATIONAL
                break
            case 'license':
                risks = response.result.categories.LICENSE
                break
            case 'version':
                risks = response.result.categories.VERSION
                break
            default:
                risks = response.result.categories.ACTIVITY
        }
        return Promise.resolve(risks)
    } catch (error) {
        logger.error('Error in getVersionRiskProfile with link: ' + riskProfileLink.href)
        throw (error)
    }
}

async function getVersionPolicyViolation(blackduckApi: BlackduckApiService, bearerToken: string,
                                         versionLinkData: IBdVersionLinkArray<IBdMetaLinks>):
                                         Promise<IBdPolicyViolationDistribution> {
    let policyStatusLink = versionLinkData._meta.links.find(link => link.rel === BD_POLICY_STATUS)
    if (policyStatusLink === undefined) throw new Error('Error link to policy status not found!')
    try {
        const response = await blackduckApi.get<IBdPolicyViolationStatus>
            (bearerToken, policyStatusLink.href, BD_HEADER_BOM_POLICY_STATUS)
        if (response.statusCode !== 200 || response.result === null) {
            throw new Error('Error in getVersionPolicyViolation with status: ' + response.statusCode)
        }                                                                      
        logger.info('Successfully received version policy violation data')
        let policies = {} as IBdPolicyViolationDistribution 
        for (const policyStatus of response.result.componentVersionStatusCounts)
            switch (policyStatus.name) {
                case 'NOT_IN_VIOLATION': 
                    policies.NOT_IN_VIOLATION = policyStatus.value
                    break
                case 'IN_VIOLATION_OVERRIDDEN':
                    policies.IN_VIOLATION_OVERRIDDEN = policyStatus.value
                    break
                default: 
                    policies.IN_VIOLATION = policyStatus.value
            }
        return Promise.resolve(policies)
    } catch (error) {
        logger.error('Error in getVersionPolicyViolation with link: ' + policyStatusLink.href)
        throw (error)
    }
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
        throw error
    }
}

function setRiskComment(risks: IBdRiskDistribution): string {
    const commentHeader = '# Detected Risks by Black Duck\n'
    const bdLink = '## [Link to Black Duck Instance](' + BD_URL + ')\n'
    const riskHigh = '## Number of Risk High Vulnerabilities: ' + risks.HIGH + '\n'
    const riskMedium =   '## Number of Risk Medium Vulnerabilities: ' + risks.MEDIUM + '\n'
    const riskLow = '## Number of Risk Low Vulnerabilities: ' + risks.LOW + '\n'
    const riskOk = '## Number of Risk OK Vulnerabilities: ' + risks.OK + '\n'
    const riskUnknown = '## Number of Risk Unknown Vulnerabilities: ' + risks.UNKNOWN + '\n'
    const riskCritical = '## Number of Risk Critical Vulnerabilities: ' + risks.CRITICAL + '\n'
    return commentHeader + bdLink + riskHigh + riskMedium + riskLow + riskOk + riskUnknown + riskCritical
}

function setPolicyViolationComment(violations: IBdPolicyViolationDistribution): string {
    const commentHeader = '# Detected Policy Violationss by Black Duck\n'
    const bdLink = '## [Link to Black Duck Instance](' + BD_URL + ')\n'
    const notInViolation = '## Number of Not In Violations: ' + violations.NOT_IN_VIOLATION + '\n'
    const inViolationOverriden = '## Number of In Violations Overridden: ' + violations.IN_VIOLATION_OVERRIDDEN + '\n'
    const inViolation = '## Number of In Violations: ' + violations.IN_VIOLATION + '\n'
    return commentHeader + bdLink + notInViolation + inViolationOverriden + inViolation
}

/**
 * Update the given commit with a new comment which holds the number of the risks per severity
*/
async function updateGitlabCommitComment(gitlabUrl: string, gitlabToken: string, gitlabProjectId: string,
                                         gitlabCommitSha: string, comment: string) : Promise<CommentSchema> {
    try {
        const res = await gitlabUpdateExistingReviewComment(gitlabUrl, gitlabToken, gitlabProjectId, gitlabCommitSha, comment)
        logger.info('Successfully updated comment for the commit in GitLab CI')
        return Promise.resolve(res)
    } catch (error) {
        throw error
    }
}
 
assert(typeof BD_URL === 'string')
assert(typeof BD_API_TOKEN === 'string')
assert(typeof BD_PROJECT === 'string')
assert(typeof BD_PROJECT_VERSION === 'string')
assert(typeof GITLAB_URL === 'string')
assert(typeof GITLAB_PJ_TOKEN === 'string')
assert(typeof GITLAB_PROJECT_ID === 'string')
assert(typeof GITLAB_COMMIT_SHA === 'string')
 
const blackduckApi = new BlackduckApiService(BD_URL, BD_API_TOKEN)

let bearerToken: string = ''
let versionLink = {} as IBdVersionLinkArray<IBdMetaLinks>
bdAuthentication(blackduckApi)
.then (bearer => {
    bearerToken = bearer
    return getProjectVersionData(blackduckApi, bearer, BD_PROJECT, BD_PROJECT_VERSION)
}).then (versionLinkData => {
    // We use vulnerability only for now
    versionLink = versionLinkData
    return getVersionRiskProfile(blackduckApi, bearerToken, versionLink, 'vulnerability')
}).then (versionRiskData => {
    logger.debug('Received version risk data: ' + JSON.stringify(versionRiskData))
    const comment = setRiskComment(versionRiskData)
    return updateGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA, comment)
}).then (comment => {
    logger.debug('Received comment scheme: ' + JSON.stringify(comment))
    return getVersionPolicyViolation(blackduckApi, bearerToken, versionLink)
}).then (policyViolations => {
    logger.debug('Received policy violation data: ' + JSON.stringify(policyViolations))
    const comment = setPolicyViolationComment(policyViolations)
    return updateGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA, comment)
}).then (comment => {
    logger.debug('Received comment scheme: ' + JSON.stringify(comment))
}).catch (error => {
    if (error instanceof Error) console.log('Black Duck update comment failed: ' + error.message)
})