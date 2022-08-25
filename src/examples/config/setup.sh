#!/bin/bash
COV_VERSION="cov-analysis-linux64-2022.6.0"
export PATH=/opt/coverity/$COV_VERSION/bin:$PATH
chmod 400 /opt/coverity/auth-key.txt
/bin/bash
