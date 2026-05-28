@echo off
REM Wrapper batch pour la tache planifiee Windows. Verifie la coherence
REM des shifts et envoie un mail a Karim si incoherences detectees. Ne
REM modifie PAS la DB automatiquement (autofix manuel uniquement).
REM Karim 2026-05-20.

cd /d "C:\Users\KElba\Documents\GitHub\Formulaire_candidats\caftan-rh"
"C:\Program Files\nodejs\node.exe" scripts\monitor-shift-coherence.mjs >> "%USERPROFILE%\caftanrh-coherence.log" 2>&1
exit /b %ERRORLEVEL%
