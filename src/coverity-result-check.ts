import { CoverityApiService } from 'synopsys-sig-node'
import { writeFileSync } from 'fs'
import assert from 'assert'

const LIMIT = 100

const COVERITY_URL = process.env.COV_CONNECT_URL
const COVERITY_CREDS = process.env.COV_CREDENTIALS
const COVERITY_PROJECT = process.env.COV_PROJECT
const COVERITY_FILE_PATH = process.env.MK_COVFILE_PATH

async function getCoverityIssues(coverityUrl: string, coverityCreds: string, coverityProject: string,
                                 gitlabTempfilePath: string): Promise<void> {
    const coverityUser = coverityCreds.split(/[:]/)[0]
    const coverityPass = coverityCreds.split(/[:]/)[1]

    const coverityApi = new CoverityApiService(coverityUrl, coverityUser, coverityPass);    

    let offset = 0
    let totalReceived = 0
    writeFileSync(gitlabTempfilePath, 'Coverity Scan Result \n')

    while (true) {
        const results = await coverityApi.findIssues(coverityProject, offset, LIMIT)
        if (results.totalRows === undefined || results.totalRows === 0) {
            throw new Error('No results could be received for Coverity project: ' + COVERITY_PROJECT)
        }
    
        for (let row of results.rows) {
            let line = ''
            for (let issue of row) {
                let pair = `${issue.key}: ${issue.value}, `
                line += pair
            }
            writeFileSync(gitlabTempfilePath, line, {flag: 'a'})
        }

        totalReceived += LIMIT
        if (totalReceived >= results.totalRows) break
        offset += LIMIT
    }

    Promise.resolve()
}

assert(typeof COVERITY_URL === 'string')
assert(typeof COVERITY_CREDS === 'string')
assert(typeof COVERITY_PROJECT === 'string')
assert(typeof COVERITY_FILE_PATH === 'string')

getCoverityIssues(COVERITY_URL, COVERITY_CREDS, COVERITY_PROJECT, COVERITY_FILE_PATH)
.then(() => {
    console.log('Coverity results downloaded to ' + COVERITY_FILE_PATH)
})
.catch(error => {
    if (error instanceof Error) {
        console.log('Error in getCoverityIssues: ' + error.message)
    } else {
        console.log('Error in getCoverityIssues')
    }
})