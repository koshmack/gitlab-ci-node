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

interface IBdPolicyViolationDistribution {
    severity:    string,
    category:    string,
    description: string
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
        throw error
    }
}

// TODO: to bemoved to blackduck-api.ts
async function getListProjects(blackduckApi: BlackduckApiService, bearerToken: string, offset: number, limit: number):
                               Promise<IRestResponse<IBdItemArray<IBdProjectLinkArray<IBdMetaLinks>>>> {
    const requestUrl = `${BD_URL}${BD_API_LIST_PROJECTS}?offset=${offset}&limit=${limit}`
    try {
        const response = await blackduckApi.get<IBdItemArray<IBdProjectLinkArray<IBdMetaLinks>>>
                                               (bearerToken, requestUrl, BD_HEADER_PROJECT_DETIAL4)
        return Promise.resolve(response)
    } catch (error) {
        throw error
    }    
}

// TODO: to bemoved to blackduck-api.ts
async function getVersionData(blackduckApi: BlackduckApiService, bearerToken: string, url: string, versionName: string):
                              Promise<IRestResponse<IBdItemArray<IBdVersionLinkArray<IBdMetaLinks>>>> {
    try {
        const response = await blackduckApi.get<IBdItemArray<IBdVersionLinkArray<IBdMetaLinks>>>
                                               (bearerToken, url, BD_HEADER_PROJECT_DETIAL5)
        return Promise.resolve(response)
    } catch (error) {
        throw (error)
    }
}

// TODO: to bemoved to blackduck-api.ts
/**
 * Get project-version href data which matches received project and version names
 * @return project-version href data[] 
 */
async function getProjectVersionData(blackduckApi: BlackduckApiService, bearerToken: string, projectName: string, versionName: string):
                                     Promise<IBdVersionLinkArray<IBdMetaLinks>> {
    let offset = 0
    while (true) {
        try {
            // Search project name unitl the end of the paginated project list 
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
            const respVersion = await getVersionData(blackduckApi, bearerToken, versionLink.href, versionName)
            if (respVersion.statusCode !== 200 || respVersion.result === null) {
                throw new Error('Error in getVersionData with status: ' + respVersion.statusCode)
            }
            logger.info('Successfully received version data')

            const versionItem = respVersion.result.items.find(item => item.versionName == versionName)
            if (versionItem === undefined) throw new Error('Error searched version name not found!') 
            return Promise.resolve(versionItem)  
        } catch (error) {
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
                                               (bearerToken, riskProfileLink.href, BD_HEADER_PROJECT_DETIAL5)
        if (response.statusCode !== 200 || response.result === null) {
            throw new Error('Error in getVersionRiskProfile with status: ' + response.statusCode)
        }                                                                      
        logger.info('Successfully received version risk profile data')
        let riskArray: IBdRiskDistribution
        switch (searchedRisk) {
            case 'vulnerability':
                riskArray = response.result.categories.VULNERABILITY
                break
            case 'operational':
                riskArray = response.result.categories.OPERATIONAL
                break
            case 'license':
                riskArray = response.result.categories.LICENSE
                break
            case 'version':
                riskArray = response.result.categories.VERSION
                break
            default:
                riskArray = response.result.categories.ACTIVITY
        }
        return Promise.resolve(riskArray)
    } catch (error) {
        throw (error)
    }
}

async function getVersionPolicyViolation(blackduckApi: BlackduckApiService, bearerToken: string, 
                                         versionLinkData: IBdVersionLinkArray<IBdMetaLinks>): Promise<IBdPolicyViolationDistribution> {
    let policyStatusLink = versionLinkData._meta.links.find(link => link.rel === BD_POLICY_STATUS)
    if (policyStatusLink === undefined) throw new Error('Error link to policy status not found!')
    try {
        const response = await blackduckApi.get<IBdVersionRiskProfile<IBdRiskDistribution>>
              (bearerToken, riskProfileLink.href, BD_HEADER_PROJECT_DETIAL5)
if (response.statusCode !== 200 || response.result === null) {
throw new Error('Error in getVersionRiskProfile with status: ' + response.statusCode)
}                                                                      
logger.info('Successfully received version risk profile data')
let riskArray: IBdRiskDistribution
switch (searchedRisk) {
case 'vulnerability':
riskArray = response.result.categories.VULNERABILITY
break
case 'operational':
riskArray = response.result.categories.OPERATIONAL
break
case 'license':
riskArray = response.result.categories.LICENSE
break
case 'version':
riskArray = response.result.categories.VERSION
break
default:
riskArray = response.result.categories.ACTIVITY
}
return Promise.resolve(riskArray)
} catch (error) {
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
        if (error instanceof Error) console.log(error.message)
        throw error
    }
}
 
/**
 * Update the given commit with a new comment which holds the number of the risks per severity
*/
async function updateGitlabCommitComment(gitlabUrl: string, gitlabToken: string, gitlabProjectId: string,
                                         gitlabCommitSha: string, risks: IBdRiskDistribution) : Promise<CommentSchema> {
    const commentHeader = '# Test Header by blackduck-update-comment.ts\n'
    // TODO to replace general coverity link with link to the 'relevant view + project'
    const bdLink =       '## [Link to Black Duck Instance](' + BD_URL + ')\n'
    const riskHigh =     '## Number of Risk High Vulnerabilities: ' + risks.HIGH + '\n'
    const riskMedium =   '## Number of Risk Medium Vulnerabilities: ' + risks.MEDIUM + '\n'
    const riskLow =      '## Number of Risk Low Vulnerabilities: ' + risks.LOW + '\n'
    const riskOk =       '## Number of Risk OK Vulnerabilities: ' + risks.OK + '\n'
    const riskUnknown =  '## Number of Risk Unknown Vulnerabilities: ' + risks.UNKNOWN + '\n'
    const riskCritical = '## Number of Risk Critical Vulnerabilities: ' + risks.CRITICAL + '\n'
    const comment = commentHeader + bdLink + riskHigh + riskMedium + riskLow + riskOk + riskUnknown + riskCritical
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
bdAuthentication(blackduckApi)
.then (bearer => {
    bearerToken = bearer
    return getProjectVersionData(blackduckApi, bearer, BD_PROJECT, BD_PROJECT_VERSION)
}).then (versionLinkData => {
    // We use vulnerability only for now
    return getVersionRiskProfile(blackduckApi, bearerToken, versionLinkData, 'vulnerability')
}).then (versionRiskData => {
    logger.debug('Received version risk data: ' + JSON.stringify(versionRiskData))
    return updateGitlabCommitComment(GITLAB_URL, GITLAB_PJ_TOKEN, GITLAB_PROJECT_ID, GITLAB_COMMIT_SHA, versionRiskData)
}).then (comment => {
    logger.debug('Received comment scheme: ' + JSON.stringify(comment))
})
.catch (error => {
    if (error instanceof Error) console.log('Black Duck failed in Rest API: ' + error.message)
})