@ECHO off
SETLOCAL

REM Change directory to location of this script.
CD /D "%~dp0"

REM Print logo
TYPE logo.txt

REM Make scratch space.
SET scratch=%temp%\%random%

REM Get date mm/dd/yyyy.
date /t > %scratch%
SET /p value= < %scratch%
SET day=%value:~4,-1%
SET firstChar=%day:~0,1%
IF "%firstChar%"=="0" (SET day=%day:~1%)

REM Get hour and AM/PM.
time /t > %scratch%
SET /p value= < %scratch%
SET hr=%value:~0,2%
SET amPm=%value:~-2%

REM Get minutes and seconds.
SET value=%time%
SET minSec=%value:~3,-3%

REM Concatenate to make timestamp.
SET now=%hr%:%minSec% %amPm%
SET logFile=..\logs\%day% %now%.log
SET logFile=%logFile::=;%
SET logFile=%logFile:/=-%
CALL :RESOLVE_PATH "%logFile%" > %scratch%
SET /p logFile= < %scratch%
ECHO Logging output to: `%logFile%`

REM Cleanup scratch space.
del %scratch%
REM Pull latest code from Git.
SET GIT_PATH=PortableGit\bin
SET msg= INFO ^| %day% ^| %now% ^| Attempting `git pull` of latest code from GitHub.
REM Tricky escaping...
ECHO %msg:|=^^^|% 2>&1 | tee.cmd "%logFile%"
%GIT_PATH%\git.exe pull 2>&1 | tee.cmd "%logFile%" -a
IF %ERRORLEVEL% neq 0 GOTO GIT_FAILED

REM Run the script, redirecting outputs to log file.
SET NODE_PATH=PortableNode
%NODE_PATH%\node ..\src\index.js 2>&1 | tee.cmd "%logFile%" -a
ECHO An error occurred. Check the logs for details (`%logFile%`).
GOTO :EOF

:RESOLVE_PATH
ECHO %~f1
EXIT /b

:GIT_FAILED
ECHO `git pull` failed! Check logs for what went wrong (see `%logFile%`).