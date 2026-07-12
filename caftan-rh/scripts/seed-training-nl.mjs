// Karim 2026-07-12 : traduction NÉERLANDAISE (Anvers) du dossier de formation.
// Remplit title_nl/body_nl des 30 modules + q_nl/choices_nl des 6 examens.
import { readFileSync } from "node:fs";
import pg from "pg";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.replace(/^["']|["']$/g, "").trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Leçons : seq -> {t: titre_nl, b: body_nl}
const LESSONS = {
1: { t: "Welkom bij Caftan Factory 🎉", b:
`Hallo en welkom in het team! 🎉

Je opleiding start vandaag en begeleidt je stap voor stap tijdens je eerste weken. Elke dag krijg je een korte sectie — concreet en meteen bruikbaar in de winkel.

Niemand verwacht perfectie: iedereen begint. Wat snel opvalt is niet de ervaring, maar de manier waarop je je debuut aanpakt: maturiteit, teamgevoel, en het vermogen om je aan te passen aan het team dat je vervoegt — want elk team heeft zijn codes, ritme en evenwicht.

Door deze richtlijnen nu al in gedachten te houden, corrigeer je vanzelf de kleine beginnersfoutjes, en toon je — zonder het te moeten zeggen — dat je het in je hebt om een echte professional en een waardevolle teamgenoot te zijn.

Onthoud de geest meer dan de letter, en vertrouw ons: we zijn er om je te begeleiden. 💛` },
2: { t: "De geest van Caftan Factory & de kleurcode van de regels 🔴🟠🟢", b:
`Om je snel weg te wijzen heeft elke regel een kleur:

🔴 NIET-ONDERHANDELBARE REGEL — elke afwijking is een zware fout.
(bv. de kassa, de veiligheid, de gsm tijdens de dienst, niet-toegestane kortingen)

🟠 KWALITEITSSTANDAARD — verwacht van elke medewerker.
(bv. het onthaal, opruimen, kledij, stiptheid)

🟢 GOEDE PRAKTIJK — wat een goede medewerker onderscheidt van een uitstekende.
(bv. hulpvaardigheid, anticiperen, oog voor detail, continu verbeteren)

Houd deze code in gedachten: hij vertelt je altijd in één oogopslag wat onder conformiteit valt, wat over servicekwaliteit gaat, en wat je positief zal doen opvallen. 😉` },
3: { t: "Stiptheid & aanwezigheid ⏰", b:
`De basis van een pro: er zijn, op tijd, klaar. 🟠

✅ Wees aanwezig en klaar bij de start van de shift — niet 'op de minuut'.
✅ Verlaat je post niet vóór het einde van de shift of de sluiting.
✅ Elke afwezigheid van de afdeling, ook kort, meld je aan de verantwoordelijke (nooit de vloer onbemand).
🔴 Laat de winkel nooit onbewaakt tijdens de openingsuren.
✅ Bij vertraging of verhindering: verwittig de verantwoordelijke zo vroeg mogelijk.
✅ Raadpleeg en respecteer de planning; je improviseert je uren niet.` },
4: { t: "Kledij & houding ✨", b:
`Je houding en je kledij zijn het eerste beeld van de winkel. 🟠

✅ Verzorgde kledij conform de richtlijnen: je draagt het imago van de zaak.
✅ Glimlach en vriendelijkheid bij elke klant, van de eerste tot de laatste.
✅ Blijf open, luisterbereid en positief, ook bij een opmerking.
🟢 Energie en betrokkenheid: vermijd nonchalance en passiviteit.` },
6: { t: "Prioriteit nr. 1: de klant — onthaal & verkoop 🛍️", b:
`De kern van het vak: elke klant onthalen en adviseren. 🟠🟢

🔴 PRIORITEIT NR. 1: onthaal, groet en ga naar ELKE klant die binnenkomt.
✅ Wees op de vloer, beschikbaar en actief: de kassa is geen terugvalpositie.
🟢 Adviseer: stel maten, aanvullende stukken en bijverkoop voor.
✅ Laat een klant nooit zonder antwoord of wachtend: neem hem snel in handen.
✅ Ken het gamma, de beschikbare maten en de voorraad om goed te adviseren.
🟢 Verwijs naar de express-retouche wanneer die een verkoop kan afronden.` },
7: { t: "Het rek: orde en aantrekkelijkheid 👕", b:
`Een net en volledig rek geeft goesting om te kopen. 🟠

✅ Rekken steeds ordelijk en aantrekkelijk.
✅ Haal beschikbare maten/varianten uit de reserve om het rek aan te vullen.
✅ Vul aan zodra een model leeg raakt, zonder te wachten.
🟢 Kleerhangers in de juiste richting, maten geordend: verzorgde presentatie.
✅ Etalage proper, volledig en up-to-date: de eerste indruk van de winkel.` },
8: { t: "Pashokjes & netheid 🧽", b:
`Een propere winkel wekt vertrouwen. 🟠

✅ Vloer, etalages, pashokjes en kassa: proper en opgeruimd de hele dag.
✅ Herconditioneer en vouw meteen op na elke klant.
✅ Zet de pashokjes in orde na elke klant — de volgende klant mag nooit de wanorde van de vorige ondergaan.
✅ Zorg voor een volledige opruiming vóór de sluiting.` },
9: { t: "De kassa: absolute nauwkeurigheid 💳", b:
`De kassa vraagt nauwkeurigheid en vertrouwen bij elke transactie. 🔴

🔴 Reken nauwkeurig af: teruggeven van wisselgeld, bedragen, betaalmiddelen.
🔴 Ruilen en terugbetalingen zijn STRIKT gereglementeerd: laat altijd goedkeuren door de verantwoordelijke.
🔴 Respecteer de kassaprocedure bij elke transactie (ticket, opening/sluiting).
🔴 Laat de kassa nooit open of onbewaakt.` },
11: { t: "De pauzes: laat nooit een winkel onbemand ☕", b:
`Goed pauzeren = nooit een verkooppunt zonder iemand laten. 🔴🟠

🔴 Een pauze mag NOOIT een team of winkel onbemand laten: stem verplicht af.
✅ Verschuif je pauze buiten de piekuren om beschikbaar te blijven.
✅ Respecteer de afgesproken duur en aantal pauzes, en kom exact op tijd terug.
✅ Kondig je pauze aan en laat ze goedkeuren voor de continuïteit van de dienst.
✅ Combineer geen pauze + late terugkeer: dat verdubbelt de afwezigheid.` },
12: { t: "Communicatie & hiërarchie 🗣️", b:
`Goed communiceren voorkomt 90% van de problemen. 🟠

🔴 Meld ONMIDDELLIJK elk probleem, incident of afwijking aan de verantwoordelijke.
🔴 Geen enkele korting, prijswijziging of commercieel gebaar zonder akkoord van de verantwoordelijke.
✅ Geef de sleutelinfo door: leveringen, breuken, bijzondere klanten, richtlijnen.` },
13: { t: "Samen in team: relaties met collega's 🤝", b:
`Een goed team betekent respect en hulpvaardigheid. 🟠🟢

✅ Houd professionele afstand: te veel nabijheid schaadt het kader.
✅ Prioriteit aan de klant en de service, niet aan het sociale leven.
✅ Vermijd samenscholingen en gebabbel op de vloer; blijf verspreid op de vloer.
✅ Geen commentaar over een klant of collega binnen gehoorsafstand van klanten.
✅ Kies geen partij in interne conflicten; vermijd roddels.
✅ Blijf op je verkooppunt; wandel niet zonder reden naar andere winkels, en meld elke verplaatsing aan de verantwoordelijke.
✅ Buiten dienst: verlaat de winkel; blijf niet hangen om te socializen.` },
14: { t: "Telefoon & sociale media 📵", b:
`Tijdens de dienst blijft de persoonlijke gsm opgeborgen. 🔴

🔴 De persoonlijke telefoon hoort niet op de vloer tijdens de dienst.
🔴 Geen foto's/video's in de winkel zonder toestemming.
✅ Privégesprekken gebeuren buiten de dienst, weg van de vloer.` },
16: { t: "Veiligheid & diefstalpreventie 🔒", b:
`De winkel beschermen is het team beschermen. 🔴

🔴 Blijf waakzaam: actief toezicht op de vloer en diefstalpreventie.
🔴 Laat geen blinde of onbewaakte zones, zeker bij drukte.
🔴 Pas de veiligheidsinstructies en de sluitingsprocedure strikt toe.` },
17: { t: "Kalm blijven: de moeilijke situaties 🧘", b:
`Kalm blijven maakt het verschil. 🟠🟢

✅ Bij een ontevreden klant: blijf kalm, beleefd en professioneel; escaleer naar de verantwoordelijke indien nodig.
✅ Regel elk meningsverschil (klant of collega) apart en buiten de piekuren — nooit voor de klanten.

🟢 De houding die bijna altijd werkt: luisteren, respecteren, eerlijk blijven, een oplossing zoeken.` },
18: { t: "De 10 gouden regels ⭐", b:
`Als je maar tien dingen mag onthouden, zijn het deze:

1. De klant gaat altijd vóór je telefoon.
2. Elk kledingstuk leg je terug alsof jij de volgende klant bent.
3. Een snel gemeld probleem is bijna altijd een klein probleem.
4. Slechte gewoontes verspreiden zich even snel als goede.
5. Kwaliteit zit in de details.
6. Elke klant vertrekt met een goed beeld van Caftan Factory.
7. Als je het niet weet, vraag het.
8. We winnen samen.
9. Vertrouwen is meer waard dan eender welke verkoop.
10. Je houding is even belangrijk als je vaardigheden. ⭐` },
19: { t: "De duurste fouten ⚠️", b:
`Sommige fouten kosten veel meer dan andere. Houd ze in gedachten:

⚠️ Een antidiefstallabel vergeten.
⚠️ Een kassa open laten.
⚠️ Een pashokje niet sluiten.
⚠️ Een artikel vergeten.
⚠️ Verkeerd wisselgeld teruggeven.
⚠️ Een niet-toegestane korting toepassen.
⚠️ Een klant niet onthalen.
⚠️ Een incident niet melden.

Het goede nieuws: ze zijn allemaal te vermijden met wat aandacht en de reflex om te vragen bij twijfel. 😉` },
21: { t: "De gewoontes van de beste verkopers 🏆", b:
`Wat zij, op wie het team het meest rekent, elke dag doen:

🏆 Ze observeren voor ze handelen, en luisteren voor ze antwoorden.
🏆 Ze gaan naar de klant met dezelfde glimlach om 10u als om 19u55.
🏆 Ze kennen hun producten, maten en voorraad.
🏆 Ze anticiperen: ze ruimen op, vullen aan en helpen vóór men het vraagt.
🏆 Ze melden het minste probleem snel.
🏆 Ze vormen en stellen de nieuwelingen gerust.
🏆 Ze verlaten de winkel in betere staat dan ze hem vonden.

Talent helpt; het zijn de gewoontes die het verschil maken. 😉` },
22: { t: "De woorden die het verschil maken: te zeggen / te vermijden 💬", b:
`Woorden tellen evenveel als het gebaar.

✅ TE ZEGGEN
In plaats van « Ik weet het niet » → « Ik ga het na om u de juiste info te geven. »
« Met plezier. » · « Ik begeleid u. » · « Neem uw tijd. » · « Bedankt voor uw bezoek. »

❌ TE VERMIJDEN
« Dat is niet mijn afdeling. »
« Dat is mijn probleem niet. »
« Ik kan niets doen. »

Een positieve zin verandert twijfel in vertrouwen. 💬` },
23: { t: "De kleine details die alles veranderen ✨", b:
`Deze details staan bijna nooit in de klassieke handleidingen — en net daar maken we het verschil:

✨ Kleerhangers altijd in dezelfde richting terugzetten.
✨ De klant aankijken wanneer je met hem praat.
✨ Nooit met de vinger wijzen.
✨ De klant tot aan het rek begeleiden in plaats van een richting aan te wijzen.
✨ Ook een klant bedanken die niets koopt.
✨ De klant nooit het gevoel geven dat hij stoort.` },
24: { t: "Echte situaties van op de vloer — deel 1 🎭", b:
`Op de vloer is de echte vraag niet 'wat is de procedure?' maar 'wat doe ik wanneer het me overkomt?'. Hier zijn doorleefde gevallen. 🎭

1) Een klante wil 18 jurken passen → onthaal met enthousiasme, maak het pashokje klaar, ruim gaandeweg op. Op het einde: « Als we uw drie favorieten zouden houden, welke? » Je helpt, je beslist niet in haar plaats.
2) Ze kijkt vaak naar de prijs → praat eerst over waarde, kwaliteit, comfort, gelegenheid. Laat haar dan nadenken.
3) Videogesprek met haar man → toegestaan. Onderbreek nooit; bied zelfs aan de jurk voor de camera te tonen.
4) « Ik kom terug met mijn moeder » → « Met plezier, we ontvangen jullie allebei. » Geen druk, meer terugkeer.
5) Ze wil een oprecht advies → zeg nooit « alles staat u goed ». Kies echt, leg uit, argumenteer.
6) Twee klantinnen tegelijk → « Ik rond af met mevrouw en kom naar u. » Gezien worden volstaat om te wachten.
7) Een kind speelt achter de jurken → benader de ouders met een glimlach: « We hebben breekbare artikelen, kunt u uw kleintje dicht bij u houden? Dank u wel. » Steeds zacht.
8) Pashokje in wanorde achtergelaten → bedank, en zet meteen in orde. Nooit ergernis tonen.
9) « Ik bestel wel op internet » → bekritiseer internet nooit: « Ik begrijp het, als ik nog een vraag kan beantwoorden, met plezier. »
10) Een klant blijft 20 min zonder iets te vragen → « Ik zie dat u de tijd neemt; als ik u kan oriënteren, met plezier. »` },
26: { t: "Echte situaties van op de vloer — deel 2 + de 10 reflexen 🎭", b:
`Het vervolg van de doorleefde gevallen:

11) Klante 5 min voor sluiting → zelfde onthaal als de anderen; informeer beleefd over de uren en blijf helpen.
12) Klante die geen Nederlands spreekt → eenvoudige woorden, gebaren, glimlach; vraag hulp van een collega. We ontvangen de hele wereld.
13) Gehaaste klante → toon 3 modellen, de meest geschikte. Kwaliteit van advies primeert op kwantiteit.
14) « Welke zou u kiezen? » → leg altijd uit waarom. De redenering wekt meer vertrouwen dan het antwoord.
15) Ze verandert drie keer van mening → geen ongeduld. Begeleid, duw nooit.
16) Groep van 5 die in haar plaats praten → herfocus: « En u, in welke voelt u zich het best? »
17) « Wie is uw beste verkoper? » → « We werken in team; zeg me wat u zoekt, we adviseren u zo goed mogelijk. »
18) Vraag om foto's → leg het beleid uit, bied dan het alternatief: « videogesprekken zijn toegestaan ».
19) Klante geneert zich in het pashokje → respecteer de privacy, klop zacht, vraag voor je een gordijn opent.
20) Je kent het antwoord niet → « Ik ga het liever na om u correcte info te geven. »

🔟 DE 10 REFLEXEN: Observeren voor je handelt · Luisteren voor je antwoordt · Uitleggen voor je weigert · Nagaan voor je bevestigt · Geruststellen voor je overtuigt · Helpen voor men het vraagt · Respecteren boven alles · Behoeften anticiperen · Kalm blijven · Zin geven om terug te komen.` },
27: { t: "Jouw evolutie: van dag 1 tot 3 maanden 📈", b:
`Hier is wat we bekijken, stap voor stap — niet om je te beoordelen, maar om je te helpen groeien:

📈 Dag 1: observatie — de winkel, producten en procedures ontdekken; een collega observeren; vragen stellen. We laten je niet alleen.
📈 Dag 2: begeleide autonomie — een winkel kunnen runnen indien nodig (opening/sluiting, basiskassa, onthaal).
📈 Dag 3: consolidatie — vlotter worden in de verkoop zonder de nauwkeurigheid los te laten.
📈 Week 2: beheersing van de procedures.
📈 Eerste maand: opbouw van competenties.
📈 Drie maanden: volledige autonomie.

Iedereen gaat op zijn eigen tempo — wat telt is de vooruitgang. 🚀` },
28: { t: "Groeien bij Caftan Factory: de 4 niveaus 🚀", b:
`Bij ons rekruteren we niet zonder perspectief. Een verkoper kan referent worden, een referent verantwoordelijke, een verantwoordelijke meerdere winkels superviseren. Maar evolutie hangt niet af van anciënniteit — ze hangt af van je dagelijks gedrag.

NIVEAU 1 — De BETROUWBARE medewerker (de basis): op tijd, respecteert de procedures, zegt de waarheid, erkent snel zijn fouten, maakt zijn werk af, laat nooit een collega in de steek.

NIVEAU 2 — De AUTONOME medewerker: neemt nuttige initiatieven, anticipeert, stelt vragen bij twijfel, vindt eenvoudige oplossingen, respecteert de procedures zonder herinnering.

NIVEAU 3 — De INVLOEDRIJKE medewerker: onthaalt de nieuwelingen, stelt gerust, geeft het voorbeeld, kalmeert spanningen, deelt zijn kennis. Als hij afwezig is, voelt het team het.

NIVEAU 4 — De toekomstige VERANTWOORDELIJKE: in staat om het team, de klanten en het bedrijf te beschermen, juiste beslissingen te nemen, kalm te blijven onder druk, Caftan Factory waardig te vertegenwoordigen.` },
29: { t: "Wat een evolutie afremt / wat ze versnelt 🧭", b:
`⛔ WAT AFREMT (enkele voorbeelden): regelmatig te laat · collega's bekritiseren · spanningen creëren · nooit fouten erkennen · telefoon tijdens de dienst · wachten tot men zegt wat te doen · details verwaarlozen · klagen zonder voorstel · weigeren te helpen · roddels · opmerkingen weigeren · niet vooruitgaan.

🚀 WAT VERSNELT: stiptheid · eerlijkheid · organisatie · spontaan helpen · nieuwsgierigheid · snel leren · kalm blijven · verbeteringen voorstellen · iedereen respecteren · een goed imago geven · zorg dragen voor de winkel · nieuwelingen vormen · verwittigen voor een probleem ontstaat · een goede sfeer creëren · vertrouwen wekken.

🔎 WAT IK PERSOONLIJK BEKIJK (het woord van de oprichter): de persoon die een kledingstuk opraapt zonder dat men het vraagt; die 5 min langer blijft om te helpen; die elke klant met dezelfde glimlach onthaalt om 10u als om 19u55; die een nieuweling beschermt; die komt zeggen « ik denk dat er een probleem is » VOOR het ontploft.

🏅 Het mooiste compliment is niet « je verkoopt goed », maar: « Ik kan twee uur weg, ik weet dat alles goed zal gaan. » Op dat moment ben je een vertrouwenspersoon geworden — en het is dat vertrouwen dat de deuren opent.` },
};

// Examens : seq -> {t, b, q: [{q_nl, choices_nl}] dans le MÊME ordre que le FR}
const EXAMS = {
5: { t: "Kleine toets — niveau 1 🧩", b: "Een eerste kleine uitdaging om de basis te valideren (onthaal, stiptheid, kledij). Antwoord eerlijk — het helpt je ook vooruit. 💪", q: [
  { q_nl: "Wanneer moet je klaar zijn om te werken?", choices_nl: ["Exact op het uur van de shift", "Klaar vóór de start van de shift", "Enkele minuten later"] },
  { q_nl: "Mag de winkel onbemand blijven tijdens de openingsuren?", choices_nl: ["Ja, heel even", "Nooit", "Als ik bij de deur blijf"] },
  { q_nl: "Je kledij en houding, dat is…", choices_nl: ["Onbelangrijk", "Het eerste beeld van de winkel, verzorg het", "Enkel voor verantwoordelijken"] },
] },
10: { t: "Kleine toets — niveau 2 🧩", b: "Een tandje hoger! 🧩 Een uitdaging over de klant, het rek en de kassa.", q: [
  { q_nl: "Als een klant binnenkomt, is je prioriteit…", choices_nl: ["Afmaken waar je mee bezig bent", "Hem onthalen en naar hem toe gaan", "Wachten tot hij iets vraagt"] },
  { q_nl: "Een klant wil ruilen of terugbetaling. Je…", choices_nl: ["Doet het zelf", "Laat het goedkeuren door de verantwoordelijke", "Weigert meteen"] },
  { q_nl: "Mag de kassa open blijven zonder toezicht?", choices_nl: ["Ja even", "Nooit", "Als ik in de buurt blijf"] },
  { q_nl: "Een model raakt leeg terwijl er voorraad is. Je…", choices_nl: ["Wacht tot einde dag", "Vult zo snel mogelijk aan", "Doet niets"] },
] },
15: { t: "Kleine toets — niveau 3 🧩", b: "Het wordt wat pittiger! 🧩 Een uitdaging over het teamleven: pauzes, communicatie, collega's, telefoon.", q: [
  { q_nl: "Je pauze valt tijdens de drukte. Je…", choices_nl: ["Neemt ze toch", "Verschuift ze buiten de piek, in overleg", "Annuleert ze volledig"] },
  { q_nl: "Mag een pauze een winkel onbemand laten?", choices_nl: ["Ja als het kort is", "Nooit: we zorgen dat alles gedekt is", "Ja bij rustige uren"] },
  { q_nl: "Je persoonlijke telefoon tijdens de dienst…", choices_nl: ["Blijft opgeborgen, weg van de vloer", "OK als het discreet is", "OK aan de kassa"] },
  { q_nl: "Je verneemt belangrijke info (levering, breuk). Je…", choices_nl: ["Houdt het voor jezelf", "Geeft het door aan team/verantwoordelijke", "Wacht tot men het vraagt"] },
  { q_nl: "Een meningsverschil met een collega vóór klanten. Je…", choices_nl: ["Regelt het meteen voor iedereen", "Regelt het apart, nooit voor klanten", "Negeert de collega de hele dag"] },
] },
20: { t: "Kleine toets — niveau 4 🧩", b: "Stevig niveau! 💪 Veiligheid, kalmte, gouden regels en te vermijden fouten.", q: [
  { q_nl: "Bij drukte, het toezicht tegen diefstal…", choices_nl: ["Mag verslappen", "Moet actief blijven, geen blinde zones", "Is niet meer jouw taak"] },
  { q_nl: "Bij een ontevreden klant, je…", choices_nl: ["Verheft je stem", "Blijft kalm en beleefd, escaleert indien nodig", "Negeert hem"] },
  { q_nl: "Welke fout kost het meest?", choices_nl: ["Traag een trui plooien", "Een kassa open laten", "Te veel glimlachen"] },
  { q_nl: "Als je het niet weet / twijfelt, zegt de gouden regel…", choices_nl: ["Een riskant initiatief nemen", "Vragen", "Helemaal niets doen"] },
  { q_nl: "Er is een incident. De juiste reflex:", choices_nl: ["Niets zeggen om problemen te vermijden", "Meteen melden aan de verantwoordelijke", "Alleen oplossen zonder iets te zeggen"] },
] },
25: { t: "Kleine toets — niveau 5 🧩", b: "Bijna aan het einde! 🎭 Een uitdaging over winnende gewoontes, de juiste woorden en echte situaties.", q: [
  { q_nl: "Een klant twijfelt door de prijs. Je…", choices_nl: ["Verlaagt zelf de prijs", "Praat eerst over waarde, kwaliteit, comfort", "Zegt dat het overal duur is"] },
  { q_nl: "In plaats van « Ik weet het niet », zeg je…", choices_nl: ["« Dat is niet mijn afdeling »", "« Ik ga het na om u de juiste info te geven »", "« Ik kan niets doen »"] },
  { q_nl: "Een klante laat het pashokje in wanorde. Je…", choices_nl: ["Toont je ergernis", "Bedankt en zet meteen in orde", "Wacht tot de sluiting"] },
  { q_nl: "Een klant blijft 20 min zonder iets te vragen. Je…", choices_nl: ["Laat hem met rust, hij wil de kalmte", "Benadert: « als ik u kan oriënteren, met plezier »", "Vraagt hem op te schieten"] },
  { q_nl: "Een klein detail dat het verschil maakt:", choices_nl: ["Met de vinger de richting wijzen", "De klant tot aan het rek begeleiden", "Een klant negeren die niets koopt"] },
] },
30: { t: "Eindtoets — niveau 6 🎓", b: "De grote finale! 🎓 Een toets die heel je parcours samenvat. Geef het beste — en proficiat met heel deze weg.", q: [
  { q_nl: "Niveau 1 van de evolutie is…", choices_nl: ["De beste verkoper in cijfers", "De BETROUWBARE medewerker (basis van alles)", "De oudste"] },
  { q_nl: "Welk gedrag VERSNELT een evolutie?", choices_nl: ["Klagen zonder voorstel", "Verwittigen voor een probleem ontstaat", "De telefoon gebruiken tijdens de dienst"] },
  { q_nl: "Een klante spreekt geen Nederlands. Je…", choices_nl: ["Geeft op", "Eenvoudige woorden, gebaren, glimlach, hulp van een collega", "Vraagt haar terug te komen"] },
  { q_nl: "Het mooiste compliment van een verantwoordelijke is…", choices_nl: ["« Je verkoopt goed »", "« Ik kan 2u weg, alles gaat goed »", "« Je bent snel »"] },
  { q_nl: "Na 3 maanden verwacht men van je…", choices_nl: ["In observatie blijven", "Volledige autonomie", "Niets beslissen"] },
  { q_nl: "De juiste houding bij een geval dat de handleiding niet voorziet:", choices_nl: ["Willekeurig improviseren", "Luisteren, respecteren, eerlijk blijven, een oplossing zoeken", "Weigeren te handelen"] },
] },
};

let nLes = 0, nEx = 0;
for (const [seq, v] of Object.entries(LESSONS)) {
  await c.query("update training_modules set title_nl=$1, body_nl=$2, updated_at=now() where seq=$3", [v.t, v.b, Number(seq)]);
  nLes++;
}
for (const [seq, v] of Object.entries(EXAMS)) {
  const row = (await c.query("select questions from training_modules where seq=$1", [Number(seq)])).rows[0];
  const qs = Array.isArray(row?.questions) ? row.questions : [];
  const merged = qs.map((q, i) => ({ ...q, q_nl: v.q[i]?.q_nl ?? null, choices_nl: v.q[i]?.choices_nl ?? null }));
  await c.query("update training_modules set title_nl=$1, body_nl=$2, questions=$3, updated_at=now() where seq=$4", [v.t, v.b, JSON.stringify(merged), Number(seq)]);
  nEx++;
}
// Vérif : modules sans NL
const miss = (await c.query("select seq, kind from training_modules where is_active and (title_nl is null or body_nl is null) order by seq")).rows;
console.log(`✅ ${nLes} leçons + ${nEx} examens traduits en NL.`);
console.log(miss.length ? `⚠️ modules sans NL: ${miss.map(m => m.seq).join(", ")}` : "✅ tous les modules ont une version NL.");
await c.end();
