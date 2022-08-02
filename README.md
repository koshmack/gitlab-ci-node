# gitlab-ci-node
## About this project
This project showcases integrations of Synopsys products with GitLab CI pipeline.
### example
![Comment to commit](image/CapturedGitLabCommitComment.PNG)

## Features
Invocation of Coverity SAST
Upload the scan results from Coverity to the GitLab commit comment
More to come...

## Getting started
### Prerequisites
synopsys-sig-node (forked version) which is included as git submodule in this project.
https://github.com/sigjpengineers/synopsys-sig-node

The following node components are required to run this showcase.

Nodejs

npm

typescript

@types/node

ts-node

### Example
An example configuration for .gitlab-ci.yml and Dockerfile for gitlab-runner is found in ![sample configuration]src/example/config

## License
Distributed under the Apache Licnese, Version 2.0. See LICENSE.txt for more information.


