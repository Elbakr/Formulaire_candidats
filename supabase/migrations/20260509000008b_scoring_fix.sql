-- Fix: shift_status n'a pas 'no_show' (c'est interview_status). On l'ajoute pour
-- pouvoir tracker les absences non excusées sur les shifts.

alter type shift_status add value if not exists 'no_show';
