#!/usr/bin/env python3
"""Generate a visual guide PDF for configuring Vercel environment variables."""
import os
PDF_SKILL_DIR = os.path.expanduser("~/my-project/skills/pdf")
import sys
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Register fonts
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'))
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/chinese/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))

# Colors
PRIMARY = colors.HexColor('#1a56db')
DARK = colors.HexColor('#1e293b')
MUTED = colors.HexColor('#64748b')
ACCENT = colors.HexColor('#7c3aed')
BG_LIGHT = colors.HexColor('#f1f5f9')
BG_STEP = colors.HexColor('#eff6ff')
WHITE = colors.white
BORDER = colors.HexColor('#cbd5e1')

# Styles
title_style = ParagraphStyle(
    name='Title', fontName='Microsoft YaHei', fontSize=28, leading=36,
    textColor=WHITE, alignment=TA_CENTER, spaceAfter=12
)
subtitle_style = ParagraphStyle(
    name='Subtitle', fontName='Calibri', fontSize=14, leading=20,
    textColor=colors.HexColor('#c7d2fe'), alignment=TA_CENTER, spaceAfter=6
)
h1_style = ParagraphStyle(
    name='H1', fontName='Microsoft YaHei', fontSize=18, leading=26,
    textColor=PRIMARY, spaceBefore=24, spaceAfter=12
)
h2_style = ParagraphStyle(
    name='H2', fontName='Microsoft YaHei', fontSize=14, leading=20,
    textColor=DARK, spaceBefore=16, spaceAfter=8
)
body_style = ParagraphStyle(
    name='Body', fontName='Calibri', fontSize=11, leading=18,
    textColor=DARK, spaceAfter=8, wordWrap='CJK'
)
step_style = ParagraphStyle(
    name='Step', fontName='Calibri', fontSize=11, leading=18,
    textColor=DARK, spaceAfter=4
)
highlight_style = ParagraphStyle(
    name='Highlight', fontName='Microsoft YaHei', fontSize=11, leading=18,
    textColor=ACCENT, spaceAfter=4
)
env_name_style = ParagraphStyle(
    name='EnvName', fontName='Times New Roman', fontSize=11, leading=18,
    textColor=colors.HexColor('#dc2626'), spaceAfter=2
)
env_value_style = ParagraphStyle(
    name='EnvValue', fontName='Times New Roman', fontSize=10, leading=16,
    textColor=MUTED, spaceAfter=8, leftIndent=20
)
note_style = ParagraphStyle(
    name='Note', fontName='Calibri', fontSize=10, leading=16,
    textColor=MUTED, spaceAfter=8, leftIndent=12, borderColor=colors.HexColor('#fbbf24'),
    borderWidth=0, borderPadding=6, backColor=colors.HexColor('#fffbeb'),
    wordWrap='CJK'
)
footer_style = ParagraphStyle(
    name='Footer', fontName='Calibri', fontSize=9, leading=14,
    textColor=MUTED, alignment=TA_CENTER
)

output_path = '/home/z/my-project/download/Guide_Vercel_Variables_Environnement.pdf'

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm
)

story = []

# ═══ COVER ═══
cover_data = [
    [Paragraph('Guide de Configuration', title_style)],
    [Paragraph('Variables d\'Environnement Vercel', ParagraphStyle(
        name='CoverTitle2', fontName='Microsoft YaHei', fontSize=22, leading=30,
        textColor=WHITE, alignment=TA_CENTER, spaceAfter=12
    ))],
    [Paragraph('PPM 2026 - ORMVA du Gharb', subtitle_style)],
    [Spacer(1, 20)],
    [Paragraph('Systeme d\'authentification par mot de passe', ParagraphStyle(
        name='CoverDesc', fontName='Calibri', fontSize=12, leading=18,
        textColor=colors.HexColor('#a5b4fc'), alignment=TA_CENTER
    ))],
]
cover_table = Table(cover_data, colWidths=[doc.width])
cover_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#0f172a')),
    ('TOPPADDING', (0, 0), (-1, -1), 30),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 30),
    ('LEFTPADDING', (0, 0), (-1, -1), 20),
    ('RIGHTPADDING', (0, 0), (-1, -1), 20),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ROUNDEDCORNERS', [12, 12, 12, 12]),
]))
story.append(Spacer(1, 60))
story.append(cover_table)
story.append(Spacer(1, 30))

# ═══ INTRODUCTION ═══
story.append(Paragraph('Pourquoi configurer les variables ?', h1_style))
story.append(Paragraph(
    'Votre dashboard PPM 2026 utilise un systeme d\'authentification par mot de passe. '
    'Deux mots de passe sont definis : un pour l\'administrateur (acces complet avec upload) '
    'et un pour l\'observateur (consultation uniquement). Ces mots de passe sont stockes dans '
    'des variables d\'environnement que vous devez configurer sur Vercel pour que '
    'l\'authentification fonctionne en production. Sans cette configuration, le dashboard '
    'ne sera pas accessible car la connexion sera refusee.',
    body_style
))

# ═══ VARIABLES LIST ═══
story.append(Paragraph('Variables a configurer', h1_style))

env_vars = [
    ['NEXTAUTH_SECRET', 'Cle secrete pour les sessions JWT', 'ppm2026ormvagsecretkey12345678', 'Obligatoire'],
    ['ADMIN_PASSWORD', 'Mot de passe administrateur (upload)', 'Admin@2026', 'Obligatoire'],
    ['USER_PASSWORD', 'Mot de passe observateur (lecture)', 'User@2026', 'Obligatoire'],
]

header_style_t = ParagraphStyle(name='TH', fontName='Microsoft YaHei', fontSize=10, textColor=WHITE, alignment=TA_CENTER)
cell_style_t = ParagraphStyle(name='TC', fontName='Times New Roman', fontSize=10, textColor=DARK, alignment=TA_CENTER)
cell_style_l = ParagraphStyle(name='TCL', fontName='Calibri', fontSize=10, textColor=DARK, alignment=TA_LEFT)

env_table_data = [
    [Paragraph('<b>Variable</b>', header_style_t),
     Paragraph('<b>Description</b>', header_style_t),
     Paragraph('<b>Valeur par defaut</b>', header_style_t),
     Paragraph('<b>Obligatoire</b>', header_style_t)],
]
for row in env_vars:
    env_table_data.append([
        Paragraph(row[0], cell_style_t),
        Paragraph(row[1], cell_style_l),
        Paragraph(row[2], cell_style_t),
        Paragraph(row[3], cell_style_t),
    ])

env_table = Table(env_table_data, colWidths=[120, 150, 120, 70])
env_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
    ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
    ('BACKGROUND', (0, 1), (-1, 1), WHITE),
    ('BACKGROUND', (0, 2), (-1, 2), BG_LIGHT),
    ('BACKGROUND', (0, 3), (-1, 3), WHITE),
    ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
]))
story.append(env_table)
story.append(Spacer(1, 12))

story.append(Paragraph(
    'Note : Vous pouvez changer les valeurs des mots de passe (ADMIN_PASSWORD et USER_PASSWORD) '
    'pour des mots de passe de votre choix. NEXTAUTH_SECRET doit etre une chaine aleatoire '
    'longue et unique.',
    note_style
))

# ═══ STEP BY STEP ═══
story.append(Paragraph('Etapes de configuration sur Vercel', h1_style))

steps = [
    {
        'num': '1',
        'title': 'Se connecter a Vercel',
        'desc': 'Allez sur vercel.com et connectez-vous avec votre compte. '
                'Une fois connecte, vous verrez votre tableau de bord avec la liste de vos projets.',
    },
    {
        'num': '2',
        'title': 'Selectionner le projet PPM 2026',
        'desc': 'Cliquez sur le projet de votre dashboard PPM 2026 dans la liste des projets. '
                'Si vous avez plusieurs projets, recherchez celui qui correspond a votre dashboard.',
    },
    {
        'num': '3',
        'title': 'Ouvrir les Parametres (Settings)',
        'desc': 'En haut de la page du projet, cliquez sur l\'onglet "Settings" (Parametres). '
                'Cet onglet se trouve dans la barre de navigation horizontale en haut, a cote de '
                '"Deployments", "Analytics", etc.',
    },
    {
        'num': '4',
        'title': 'Aller dans Environment Variables',
        'desc': 'Dans le menu lateral gauche de la page Settings, cliquez sur "Environment Variables". '
                'C\'est generalement le deuxieme ou troisieme element du menu.',
    },
    {
        'num': '5',
        'title': 'Ajouter la premiere variable : NEXTAUTH_SECRET',
        'desc': 'Dans le formulaire "Add New" :<br/>'
                '- Key (cle) : tapez <b>NEXTAUTH_SECRET</b><br/>'
                '- Value (valeur) : tapez <b>ppm2026ormvagsecretkey12345678</b><br/>'
                '- Environment : cochez les 3 cases (Production, Preview, Development)<br/>'
                '- Cliquez sur "Add" ou "Save"',
    },
    {
        'num': '6',
        'title': 'Ajouter la deuxieme variable : ADMIN_PASSWORD',
        'desc': 'Meme formulaire "Add New" :<br/>'
                '- Key : tapez <b>ADMIN_PASSWORD</b><br/>'
                '- Value : tapez <b>Admin@2026</b> (ou votre mot de passe admin choisi)<br/>'
                '- Environment : cochez les 3 cases<br/>'
                '- Cliquez sur "Add"',
    },
    {
        'num': '7',
        'title': 'Ajouter la troisieme variable : USER_PASSWORD',
        'desc': 'Meme formulaire "Add New" :<br/>'
                '- Key : tapez <b>USER_PASSWORD</b><br/>'
                '- Value : tapez <b>User@2026</b> (ou votre mot de passe observateur choisi)<br/>'
                '- Environment : cochez les 3 cases<br/>'
                '- Cliquez sur "Add"',
    },
    {
        'num': '8',
        'title': 'Redeployer le projet',
        'desc': 'Les variables d\'environnement ne sont prises en compte qu\'apres un nouveau deploiement. '
                'Allez dans l\'onglet "Deployments", trouvez le dernier deploiement, cliquez sur les "..." '
                '(trois points) a droite, puis selectionnez "Redeploy". Confirmez le redeployement. '
                'Attendez que le statut passe a "Ready".',
    },
]

for step in steps:
    # Step number + title in a colored box
    step_header_data = [
        [Paragraph(f'<b>Etape {step["num"]} : {step["title"]}</b>', ParagraphStyle(
            name=f'StepH{step["num"]}', fontName='Microsoft YaHei', fontSize=12, leading=18,
            textColor=PRIMARY
        ))]
    ]
    step_table = Table(step_header_data, colWidths=[doc.width])
    step_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_STEP),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('ROUNDEDCORNERS', [8, 8, 8, 8]),
        ('LINEBELOW', (0, 0), (-1, -1), 2, PRIMARY),
    ]))
    story.append(step_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph(step['desc'], body_style))
    story.append(Spacer(1, 8))

# ═══ VISUAL PATH ═══
story.append(Paragraph('Chemin visuel sur Vercel', h1_style))
story.append(Paragraph(
    'Voici le chemin a suivre sur l\'interface Vercel pour trouver les parametres des '
    'variables d\'environnement. Suivez ce chemin pas a pas :',
    body_style
))

path_style = ParagraphStyle(name='Path', fontName='Times New Roman', fontSize=12, leading=20,
                            textColor=WHITE, alignment=TA_CENTER)
path_data = [
    [Paragraph('vercel.com', path_style)],
    [Paragraph('<b>v</b>', ParagraphStyle(name='Arrow', fontName='Calibri', fontSize=16, textColor=colors.HexColor('#a5b4fc'), alignment=TA_CENTER))],
    [Paragraph('Dashboard > Votre Projet', path_style)],
    [Paragraph('<b>v</b>', ParagraphStyle(name='Arrow2', fontName='Calibri', fontSize=16, textColor=colors.HexColor('#a5b4fc'), alignment=TA_CENTER))],
    [Paragraph('Onglet "Settings" en haut', path_style)],
    [Paragraph('<b>v</b>', ParagraphStyle(name='Arrow3', fontName='Calibri', fontSize=16, textColor=colors.HexColor('#a5b4fc'), alignment=TA_CENTER))],
    [Paragraph('Menu "Environment Variables" a gauche', path_style)],
    [Paragraph('<b>v</b>', ParagraphStyle(name='Arrow4', fontName='Calibri', fontSize=16, textColor=colors.HexColor('#a5b4fc'), alignment=TA_CENTER))],
    [Paragraph('Formulaire "Add New" en bas', path_style)],
]
path_table = Table(path_data, colWidths=[doc.width * 0.7])
path_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('ROUNDEDCORNERS', [10, 10, 10, 10]),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
]))
story.append(Spacer(1, 10))
story.append(path_table)
story.append(Spacer(1, 16))

# ═══ VERIFICATION ═══
story.append(Paragraph('Verification apres configuration', h1_style))
story.append(Paragraph(
    'Apres avoir ajoute les 3 variables et redeploye, verifiez que tout fonctionne :',
    body_style
))

check_items = [
    'Accedez a l\'URL de votre dashboard Vercel',
    'La page de connexion doit s\'afficher avec un champ "Mot de passe"',
    'Tapez <b>Admin@2026</b> et cliquez "Se connecter" - vous devez avoir acces complet avec les boutons d\'upload',
    'Deconnectez-vous, puis tapez <b>User@2026</b> - vous devez avoir acces en lecture seule (pas de boutons upload)',
    'Un mauvais mot de passe doit afficher "Mot de passe incorrect"',
]
for item in check_items:
    check_style = ParagraphStyle(
        name=f'Check_{item[:10]}', fontName='Calibri', fontSize=11, leading=18,
        textColor=DARK, leftIndent=20, bulletIndent=8, spaceAfter=4
    )
    story.append(Paragraph(f'- {item}', check_style))

story.append(Spacer(1, 16))

# ═══ TROUBLESHOOTING ═══
story.append(Paragraph('Resolution des problemes courants', h1_style))

problems = [
    ['La page de login ne s\'affiche pas',
     'Verifiez que NEXTAUTH_SECRET est bien configure. Sans cette variable, '
     'NextAuth ne peut pas creer les sessions JWT et retourne une erreur. '
     'Assurez-vous aussi d\'avoir redeploye apres l\'ajout des variables.'],
    ['"Mot de passe incorrect" meme avec le bon mot de passe',
     'Verifiez que ADMIN_PASSWORD et USER_PASSWORD sont bien definis dans les '
     'variables d\'environnement Vercel. Les valeurs sont sensibles a la casse '
     '(majuscules/minuscules). Verifiez aussi que les 3 environnements '
     '(Production, Preview, Development) sont coches.'],
    ['Les boutons upload ne s\'affichent pas avec le mot de passe admin',
     'Le role "admin" est determine par le mot de passe. Si vous avez change '
     'ADMIN_PASSWORD sur Vercel, utilisez le nouveau mot de passe, pas "Admin@2026". '
     'Essayez de vider le cache du navigateur (Ctrl+Shift+Delete) et de vous reconnecter.'],
    ['Les variables sont bien configurees mais ca ne marche toujours pas',
     'Redeployez le projet : onglet "Deployments" > "..." sur le dernier deploiement > '
     '"Redeploy". Les variables d\'environnement ne sont lues qu\'au moment du deploiement. '
     'Un simple changement de variable sans redeployement ne suffit pas.'],
]

for i, (problem, solution) in enumerate(problems):
    prob_style = ParagraphStyle(
        name=f'Prob{i}', fontName='Microsoft YaHei', fontSize=11, leading=18,
        textColor=colors.HexColor('#dc2626'), spaceAfter=4, spaceBefore=8
    )
    story.append(Paragraph(f'Probleme : {problem}', prob_style))
    story.append(Paragraph(f'Solution : {solution}', body_style))

# ═══ FOOTER ═══
story.append(Spacer(1, 30))
story.append(Paragraph(
    'PPM 2026 - ORMVA du Gharb - Guide de configuration Vercel',
    footer_style
))

# Build
doc.build(story)
print(f"PDF genere avec succes : {output_path}")
