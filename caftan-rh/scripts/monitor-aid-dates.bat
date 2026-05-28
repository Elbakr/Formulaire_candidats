@echo off
REM Wrapper batch pour la tache planifiee Windows. Verifie quotidiennement
REM si un Aid (Fitr/Adha) approche dans les 14 jours et que sa date n est
REM pas encore confirmee. Si oui, envoie un mail rappel a Karim.
REM Karim 2026-05-20.

cd /d "C:\Users\KElba\Documents\GitHub\Formulaire_candidats\caftan-rh"
"C:\Program Files\nodejs\node.exe" scripts\monitor-aid-dates.mjs >> "%USERPROFILE%\caftanrh-aid.log" 2>&1
exit /b %ERRORLEVEL%
