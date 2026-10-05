@echo off
call npm run build > build.log 2>&1
echo DONE >> build.log
