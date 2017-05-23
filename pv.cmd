@echo off

setlocal
set VOL1=%~dp0:/usr/share/nginx/html:ro
set CONTAINER=nginx

docker run -d -p 4000:80 -v %VOL1% --name %CONTAINER% nginx:alpine
echo Please open via browser: http://localhost:4000/
echo Press any key to shutdown server.
pause
docker rm -f %CONTAINER%
endlocal
