import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

export const runtime = "edge";

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Aucun fichier audio reçu" }, { status: 400 });
        }

        console.log("📁 Fichier reçu:", file.name, file.type, file.size);

        // Étape 1 : Transcrire avec Whisper
        const transcription = await openai.audio.transcriptions.create({
            file,
            model: "whisper-1",
            language: "fr",
        });

        const text = transcription.text?.trim();

        if (!text) {
            return NextResponse.json({ error: "Transcription vide" }, { status: 500 });
        }

        console.log("🎤 Transcription:", text);

        // Étape 2 : Parser avec GPT
        const prompt = `Tu es un expert en analyse de processus métier. Analyse la phrase suivante et extrais TOUTES les actions/tâches mentionnées.

**Phrase à analyser :**
"${text}"

**RÈGLES CRITIQUES POUR L'EXTRACTION :**

1. **IDENTIFIER TOUTES LES ACTIONS** : Chaque action mentionnée doit créer UNE ligne distincte dans le tableau
   
2. **POUR LES CONDITIONNELLES** :
   - La ligne de la condition doit avoir :
     * task = la tâche de vérification/décision (ex: "Trier CV", "Valider budget")
     * condition = la question posée (ex: "CV conforme ?", "Budget disponible ?")
     * yes = l'étape/service de la PROCHAINE ACTION si OUI (ex: "1.6", "Manager")
     * no = l'étape/service de la PROCHAINE ACTION si NON (ex: "1.4", "RH")
   
   - Si les actions "si oui" ou "si non" sont explicitement mentionnées, créer des LIGNES SÉPARÉES pour ces actions avec leurs services

3. **EXEMPLES CONCRETS** :

   **Exemple 1 - Condition simple :**
   Phrase : "RH trie les CV, si conforme passe à l'étape suivante, sinon retour à réception"
   Réponse :
   [
     {
       "service": "RH",
       "step": "1.5",
       "task": "Trier CV",
       "type": "Conditionnelle",
       "condition": "CV conforme ?",
       "yes": "1.6",
       "no": "1.4"
     }
   ]

   **Exemple 2 - Condition avec actions explicites :**
   Phrase : "Manager sélectionne les candidats pour entretien, puis RH planifie les entretiens si candidats retenus, sinon RH retrie les CV"
   Réponse :
   [
     {
       "service": "Manager",
       "step": "1.6",
       "task": "Sélectionner candidats pour entretien",
       "type": "Conditionnelle",
       "condition": "Candidats retenus ?",
       "yes": "1.7",
       "no": "1.5"
     },
     {
       "service": "RH",
       "step": "1.7",
       "task": "Planifier entretiens",
       "type": "Séquentielle",
       "condition": "",
       "yes": "1.8",
       "no": ""
     }
   ]

   **Exemple 3 - Séquence simple :**
   Phrase : "RH reçoit les candidatures puis les trie"
   Réponse :
   [
     {
       "service": "RH",
       "step": "1.4",
       "task": "Recevoir candidatures",
       "type": "Séquentielle",
       "condition": "",
       "yes": "1.5",
       "no": ""
     },
     {
       "service": "RH",
       "step": "1.5",
       "task": "Trier candidatures",
       "type": "Séquentielle",
       "condition": "",
       "yes": "1.6",
       "no": ""
     }
   ]

   **Exemple 4 - Plusieurs services impliqués :**
   Phrase : "Finance valide le budget, si disponible Communication rédige l'offre, sinon retour à RH"
   Réponse :
   [
     {
       "service": "Finance",
       "step": "1.2",
       "task": "Valider budget",
       "type": "Conditionnelle",
       "condition": "Budget disponible ?",
       "yes": "1.3",
       "no": "1.1"
     },
     {
       "service": "Communication",
       "step": "1.3",
       "task": "Rédiger et publier l'offre",
       "type": "Séquentielle",
       "condition": "",
       "yes": "1.4",
       "no": ""
     }
   ]

4. **FORMAT ATTENDU (TABLEAU JSON) :**
[
  {
    "service": "nom du service (ex: RH, Finance, Manager, Communication, IT, Candidat)",
    "step": "numéro d'étape au format X.Y (laisser vide pour auto-génération)",
    "task": "description PRÉCISE de la tâche ou action",
    "type": "Séquentielle" ou "Conditionnelle",
    "condition": "question si Conditionnelle (ex: 'Budget disponible ?'), sinon vide",
    "yes": "étape suivante ou nom du service (ex: '1.3', 'Manager')",
    "no": "étape alternative ou nom du service (ex: '1.1', 'RH'), vide si Séquentielle"
  }
]

5. **RÈGLES DE NUMÉROTATION :**
   - Si l'étape n'est pas mentionnée explicitement, laisse le champ "step" vide (sera auto-généré)
   - Les étapes doivent être séquentielles : 1.1, 1.2, 1.3, etc.
   - yes/no peuvent être des numéros d'étape OU des noms de service

6. **NE PAS CRÉER DE LIGNE POUR :**
   - Les simples transitions sans action (ex: "envoyer à", "transférer à")
   - Les services mentionnés mais sans action explicite

**Réponds UNIQUEMENT avec le TABLEAU JSON, sans texte additionnel, sans balises markdown.**`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Tu es un assistant expert qui convertit des descriptions vocales en données structurées JSON pour des processus métier. Tu réponds UNIQUEMENT en JSON valide (format tableau), sans formatage markdown. Tu identifies TOUTES les actions mentionnées et crées une ligne pour chaque action avec son service."
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.2,
        });

        const result = completion.choices[0].message?.content?.trim();

        if (!result) {
            return NextResponse.json({ error: "Pas de réponse de l'IA" }, { status: 500 });
        }

        console.log("🤖 Réponse GPT:", result);

        let parsedData;
        try {
            const jsonMatch = result.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : result;

            parsedData = JSON.parse(jsonString);

            if (!Array.isArray(parsedData)) {
                parsedData = [parsedData];
            }

            if (parsedData.length === 0) {
                throw new Error("Aucune étape extraite");
            }

            for (const item of parsedData) {
                if (!item.task) {
                    throw new Error("Chaque étape doit avoir une tâche");
                }
                if (!item.service) {
                    throw new Error("Chaque étape doit avoir un service");
                }
            }

            console.log("✅ Données parsées:", parsedData);

        } catch (parseError: any) {
            console.error("❌ Erreur de parsing JSON:", parseError);
            return NextResponse.json({
                error: "Format JSON invalide reçu de l'IA",
                details: parseError.message,
                rawResponse: result
            }, { status: 500 });
        }

        return NextResponse.json({
            transcription: text,
            parsedData: parsedData,
            success: true,
        });

    } catch (error: any) {
        console.error("❌ Erreur API:", error);

        return NextResponse.json({
            error: "Erreur lors du traitement",
            details: error.message || "Erreur inconnue"
        }, { status: 500 });
    }
}