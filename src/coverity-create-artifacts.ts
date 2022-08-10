import { CoverityApiService } from 'synopsys-sig-node'
import { writeFileSync } from 'fs'
import assert from 'assert'

const LIMIT = 100

const COVERITY_URL = process.env.COV_CONNECT_URL
const COVERITY_CREDS = process.env.COV_CREDENTIALS
const COVERITY_PROJECT = process.env.COV_PROJECT
const COVERITY_ISSUEFILE_PATH = process.env.COV_ISSUEFILE_PATH

async function writeCoverityIssuesToFile(coverityUrl: string, coverityCreds: string, coverityProject: string,
                                         coverityIssuefilePath: string): Promise<void> {
    const coverityUser = coverityCreds.split(/[:]/)[0]
    const coverityPass = coverityCreds.split(/[:]/)[1]

    const coverityApi = new CoverityApiService(coverityUrl, coverityUser, coverityPass);    

    let offset = 0
    let totalReceived = 0

    writeFileSync(coverityIssuefilePath, 'Coverity Scan Result \n')

    while (true) {
        const results = await coverityApi.findIssues(coverityProject, offset, LIMIT)
        if (results.totalRows === undefined || results.totalRows === 0) {
            throw new Error('No results could be received for Coverity project: ' + COVERITY_PROJECT)
        }

        results.rows.forEach((row, index) => {
            let line = ''
            // Write headers
            if (index === 0 && offset === 0) {
                for (let issue of row) {
                    line += `${issue.key}, `
                }
                line += '\n'
                writeFileSync(coverityIssuefilePath, line, {flag: 'a'})
                line = ''
            }
            // Write issues
            for (let issue of row) {
                // Comma is possibly used in the received value which does not fit the csv format. Replace with space.
                const searchExp = new RegExp(',', 'g')
                line += `${issue.value.replace(searchExp, ' ')}, `
            }
            line += '\n' 
            writeFileSync(coverityIssuefilePath, line, {flag: 'a'})
        })

        totalReceived += LIMIT
        if (totalReceived >= results.totalRows) break
        offset += LIMIT
    }
    Promise.resolve()
}

assert(typeof COVERITY_URL === 'string')
assert(typeof COVERITY_CREDS === 'string')
assert(typeof COVERITY_PROJECT === 'string')
assert(typeof COVERITY_ISSUEFILE_PATH === 'string')

writeCoverityIssuesToFile(COVERITY_URL, COVERITY_CREDS, COVERITY_PROJECT, COVERITY_ISSUEFILE_PATH)
.then ( () => {
    console.log('File for Coverity issues is created.')
})
.catch (error => {
    if (error instanceof Error) {
        console.log('Exception occured. ' + error.message)
    } else {
        console.log('Exception occured in checking coverity issues')
    }
})