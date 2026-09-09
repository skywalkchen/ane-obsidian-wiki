@echo off
echo Start uploading to GitHub...
git add .
git commit -m "Update wiki: %date% %time%"
git push origin main
echo MISSION COMPLETED！
pause