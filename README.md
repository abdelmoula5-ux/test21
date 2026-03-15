# QuizAzure — Application de sondage temps réel

Application quiz/sondage en ligne avec calcul des résultats en temps réel, déployée sur Azure Web App avec autoscaling.

## Stack technique

- **Runtime** : Node.js 20 + Express
- **Temps réel** : Socket.IO
- **Base de données** : Azure SQL Database (mssql)
- **Hébergement** : Azure Web App (App Service Plan)
- **Autoscaling** : Azure Monitor + App Service autoscale rules
- **CI/CD** : GitHub Actions

---

## Structure du projet

```
quiz-azure/
├── server.js                          # Point d'entrée principal
├── package.json
├── .env.example                       # Variables d'environnement
├── src/
│   ├── models/
│   │   └── db.js                      # Connexion Azure SQL + schema init
│   ├── routes/
│   │   ├── quiz.js                    # Endpoints quiz (join, answer)
│   │   ├── admin.js                   # Endpoints admin (CRUD quiz)
│   │   ├── participant.js             # Score, leaderboard
│   │   └── results.js                 # Résultats + CSV export + webhook
│   ├── controllers/
│   │   └── socketController.js        # Handlers Socket.IO temps réel
│   └── functions/
│       └── calculateResults/
│           ├── index.js               # Azure Function HTTP trigger
│           └── function.json          # Bindings Azure Function
├── public/
│   ├── index.html                     # SPA frontend
│   ├── css/app.css
│   └── js/app.js
└── .github/
    └── workflows/
        └── azure-deploy.yml           # CI/CD GitHub Actions → Azure
```

---

## Déploiement sur Azure

### Étape 1 — Créer les ressources Azure

```bash
# Login Azure CLI
az login

# Variables
RG="quiz-rg"
LOCATION="francecentral"
APP_NAME="quiz-azure-app"        # Doit être unique globalement
SQL_SERVER="quiz-sql-server"
SQL_DB="QuizDB"
SQL_USER="quizadmin"
SQL_PASS="YourStrongP@ssword123!"

# Resource Group
az group create --name $RG --location $LOCATION

# Azure SQL Server + Database
az sql server create \
  --name $SQL_SERVER \
  --resource-group $RG \
  --location $LOCATION \
  --admin-user $SQL_USER \
  --admin-password $SQL_PASS

az sql db create \
  --resource-group $RG \
  --server $SQL_SERVER \
  --name $SQL_DB \
  --service-objective S1

# Autoriser les services Azure à accéder au SQL
az sql server firewall-rule create \
  --resource-group $RG \
  --server $SQL_SERVER \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# App Service Plan (avec autoscaling possible)
az appservice plan create \
  --name quiz-plan \
  --resource-group $RG \
  --location $LOCATION \
  --sku S2 \
  --is-linux

# Web App Node.js
az webapp create \
  --resource-group $RG \
  --plan quiz-plan \
  --name $APP_NAME \
  --runtime "NODE:20-lts"

# Configurer les variables d'environnement
az webapp config appsettings set \
  --resource-group $RG \
  --name $APP_NAME \
  --settings \
    NODE_ENV=production \
    DB_SERVER="${SQL_SERVER}.database.windows.net" \
    DB_NAME=$SQL_DB \
    DB_USER=$SQL_USER \
    DB_PASSWORD=$SQL_PASS \
    SESSION_SECRET="$(openssl rand -hex 32)" \
    ADMIN_TOKEN="$(openssl rand -hex 16)"
```

### Étape 2 — Configurer l'autoscaling

```bash
# Activer l'autoscaling sur l'App Service Plan
az monitor autoscale create \
  --resource-group $RG \
  --resource quiz-plan \
  --resource-type Microsoft.Web/serverfarms \
  --name quiz-autoscale \
  --min-count 1 \
  --max-count 5 \
  --count 1

# Règle scale-out si CPU > 70%
az monitor autoscale rule create \
  --resource-group $RG \
  --autoscale-name quiz-autoscale \
  --condition "Percentage CPU > 70 avg 5m" \
  --scale out 1

# Règle scale-in si CPU < 30%
az monitor autoscale rule create \
  --resource-group $RG \
  --autoscale-name quiz-autoscale \
  --condition "Percentage CPU < 30 avg 5m" \
  --scale in 1
```

### Étape 3 — Connecter GitHub Actions

1. Dans le portail Azure → ton Web App → **Deployment Center**
2. Choisir **GitHub** comme source
3. Sélectionner ton repo et la branche `main`
4. Télécharger le **Publish Profile** (bouton en haut)
5. Dans GitHub → Settings → Secrets → Actions → **New secret**
   - Nom : `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Valeur : coller le contenu du fichier publish profile

6. Modifier `.github/workflows/azure-deploy.yml` ligne 9 :
   ```yaml
   AZURE_WEBAPP_NAME: ton-nom-app   # ← mettre le vrai nom
   ```

### Étape 4 — Push et déploiement automatique

```bash
git init
git add .
git commit -m "Initial commit — QuizAzure"
git branch -M main
git remote add origin https://github.com/TON-USERNAME/quiz-azure.git
git push -u origin main
```

Le pipeline GitHub Actions se déclenche automatiquement → déploiement sur Azure ✅

---

## Développement local

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env
# → Remplir les valeurs dans .env

# Lancer en mode développement
npm run dev

# Ouvrir http://localhost:3000
```

---

## API Reference

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/quiz` | Liste des quiz actifs |
| GET | `/api/quiz/:id` | Détail d'un quiz |
| POST | `/api/quiz/:id/join` | Rejoindre un quiz |
| POST | `/api/quiz/:id/answer` | Soumettre une réponse |
| GET | `/api/results/:quizId` | Résultats temps réel |
| GET | `/api/results/:quizId/export` | Export CSV |
| POST | `/api/results/:quizId/notify` | Envoyer webhook |
| POST | `/api/admin/quiz` | Créer un quiz (token requis) |
| PATCH | `/api/admin/quiz/:id/activate` | Activer/désactiver |
| GET | `/health` | Health check Azure |

---

## Créer un quiz (exemple)

```bash
curl -X POST https://ton-app.azurewebsites.net/api/admin/quiz \
  -H "Content-Type: application/json" \
  -H "x-admin-token: TON_ADMIN_TOKEN" \
  -d '{
    "title": "Quiz Azure Fundamentals",
    "description": "Teste tes connaissances sur Microsoft Azure",
    "createdBy": "admin",
    "questions": [
      {
        "text": "Quel service Azure gère l autoscaling des Web Apps ?",
        "options": ["App Service Plan", "Azure Functions", "AKS", "Azure VM"],
        "correctIdx": 0
      },
      {
        "text": "Quel protocole utilise Socket.IO par défaut ?",
        "options": ["HTTP", "WebSocket", "gRPC", "MQTT"],
        "correctIdx": 1
      }
    ]
  }'
```
