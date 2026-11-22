WITH translated_rows (external_id, language_code, title, description, category) AS (
    VALUES
        ('https://www.bbc.co.uk/sport/football/articles/c6293wx6g43o#14', 'fr', 'Rapport accablant sur les troubles de l’Old Firm : comment les autorités vont-elles réagir ?', 'L’enquête indépendante sur les troubles de foule lors du quart de finale de Scottish Cup entre Rangers et Celtic à Ibrox a mis quatre mois à arriver, mais son constat est sévère.', 'autre'),
        ('https://www.bbc.co.uk/sport/football/articles/c6293wx6g43o#14', 'ar', 'تقرير دامغ عن اضطرابات أولد فيرم: كيف سترد السلطات؟', 'استغرق التقرير المستقل حول اضطرابات الجماهير في ربع نهائي كأس اسكتلندا بين رينجرز وسيلتيك في إيبروكس أربعة أشهر، لكنه جاء بنتائج شديدة اللهجة.', 'أخرى'),
        ('https://www.bbc.co.uk/sport/football/articles/c6293wx6g43o#14', 'de', 'Vernichtender Bericht zu Old-Firm-Ausschreitungen: Wie reagieren die Behörden?', 'Der unabhängige Bericht zu den Zuschauerunruhen beim schottischen Pokal-Viertelfinale zwischen Rangers und Celtic in Ibrox brauchte vier Monate, fällt aber deutlich aus.', 'sonstiges'),
        ('https://www.bbc.co.uk/sport/football/articles/c6293wx6g43o#14', 'es', 'Informe demoledor sobre los disturbios del Old Firm: ¿cómo responderán las autoridades?', 'La revisión independiente sobre los disturbios en el cuarto de final de la Copa de Escocia entre Rangers y Celtic en Ibrox tardó cuatro meses, pero llegó con conclusiones contundentes.', 'otro'),

        ('https://www.bbc.co.uk/sport/football/articles/cp3rz7654w6o#4', 'fr', 'Forest se renseigne sur Diomande du Sporting', 'Le Sporting a reçu une prise de contact de Nottingham Forest pour le défenseur central Ousmane Diomande.', 'transfert'),
        ('https://www.bbc.co.uk/sport/football/articles/cp3rz7654w6o#4', 'ar', 'فورست يستفسر عن ديوماندي لاعب سبورتينغ', 'تلقى سبورتينغ استفساراً من نوتنغهام فورست بشأن قلب الدفاع عثمان ديوماندي.', 'انتقالات'),
        ('https://www.bbc.co.uk/sport/football/articles/cp3rz7654w6o#4', 'de', 'Forest erkundigt sich nach Sporting-Verteidiger Diomande', 'Sporting hat eine Anfrage von Nottingham Forest für Innenverteidiger Ousmane Diomande erhalten.', 'transfer'),
        ('https://www.bbc.co.uk/sport/football/articles/cp3rz7654w6o#4', 'es', 'Forest pregunta por Diomande, del Sporting', 'Sporting ha recibido una consulta de Nottingham Forest por el defensa central Ousmane Diomande.', 'fichajes'),

        ('https://www.bbc.co.uk/sounds/play/w3ct9bcy#7', 'fr', 'Au-delà du score', 'Erling Haaland n’a pas soulevé la Coupe du monde, mais il a gagné des millions de nouveaux fans aux États-Unis.', 'lifestyle'),
        ('https://www.bbc.co.uk/sounds/play/w3ct9bcy#7', 'ar', 'أكثر من النتيجة', 'لم يرفع إرلينغ هالاند كأس العالم، لكنه كسب ملايين المشجعين الجدد في الولايات المتحدة.', 'أسلوب حياة'),
        ('https://www.bbc.co.uk/sounds/play/w3ct9bcy#7', 'de', 'Mehr als das Ergebnis', 'Erling Haaland hat die Weltmeisterschaft nicht gewonnen, aber in den USA Millionen neue Fans gewonnen.', 'lifestyle'),
        ('https://www.bbc.co.uk/sounds/play/w3ct9bcy#7', 'es', 'Más que el marcador', 'Erling Haaland no levantó la Copa del Mundo, pero ganó millones de nuevos seguidores en Estados Unidos.', 'estilo de vida')
)
INSERT INTO news_translations (
    news_id,
    language_code,
    title,
    description,
    category
)
SELECT
    news.id,
    translated_rows.language_code,
    translated_rows.title,
    translated_rows.description,
    translated_rows.category
FROM translated_rows
JOIN news ON news.external_id = translated_rows.external_id
ON CONFLICT (news_id, language_code) DO UPDATE
SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();
