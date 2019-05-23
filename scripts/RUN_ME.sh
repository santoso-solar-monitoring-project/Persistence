#!/usr/bin/env bash

# Change directory to location of this script.
cd "$(dirname "$0")"

# Print logo
cat logo.txt

# Name log file
day=$(date +"%m/%d/%Y")
if [[ "$day" == "0"* ]]; then
  day=${day:1}
fi
now=$(date +"%r")
logFile="$day $now.log"
logFile="${logFile//:/;}"
logFile="${logFile//\//-}"
logFile="../logs/$logFile"
echo "Logging output to: \`$(realpath "$logFile")\`"

# Find Git.
checkGitPath=$(which git)
retVal=$?
GIT_PATH=${GIT_PATH:-$checkGitPath}
if [ $retVal -ne 0 ]; then
  echo '`git` not found. Please install git or set the GIT_PATH variable to its location.'
  exit $retVal
fi

# Pull latest code from Git.
msg=' INFO | '$day' | '$now' | Attempting `git pull` of latest code from GitHub.'
echo "$msg" 2>&1 | tee "$logFile"
${GIT_PATH} pull 2>&1 | tee -a "$logFile"
retVal=$?
if [ $retVal -ne 0 ]; then
  echo '`git pull` failed! Check logs for what went wrong' "(see \`$logFile\`)."
  exit $retVal
fi

# Run the script, redirecting outputs to log file.
checkNodePath=$(which node)
retVal=$?
NODE_PATH=${NODE_PATH:-$checkNodePath}
if [ $retVal -ne 0 ]; then
  echo '`node` not found. Please install node or set the NODE_PATH variable to its location.'
  exit $retVal
fi
$NODE_PATH ../src/index.js 2>&1 | tee -a "$logFile"
