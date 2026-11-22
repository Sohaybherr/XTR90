@echo off
cd /d C:\Users\SOHAYB\Documents\375scores\project-fixed\project\myapp-backend
python scripts\sync_transfermarkt.py --resources all --limit 0 --sleep 0.7 > logs\transfermarkt-resume-cmd.log 2>&1
