#!/bin/bash
# Vérification automatique : le code local est-il poussé sur GitHub ?
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "none")

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "⚠️ ATTENTION : Commit local non poussé sur GitHub !"
  echo "Local : $LOCAL"
  echo "Remote: $REMOTE"
  echo "→ Vercel ne déploiera PAS les dernières modifications"
  echo ""
  echo "Pour pousser : git push origin main"
else
  echo "✅ Local et Remote sont synchronisés"
  echo "Commit: $LOCAL"
fi
