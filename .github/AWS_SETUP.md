# AWS Deployment Setup

## 1. Sur le PC entreprise — AWS Console (une seule fois)

### Créer le repo ECR
```
ECR > Create repository > processmate-clinic
```
Note l'URI : `<account-id>.dkr.ecr.<region>.amazonaws.com/processmate-clinic`

### Créer le cluster ECS
```
ECS > Clusters > Create > processmate (type: Fargate)
```

### Créer la task definition  `clinic-task`
- Family: `clinic-task`
- Container name: `clinic`
- Image: `<ECR URI>/processmate-clinic:latest`
- Port: `8002`
- Environment variables (à remplir) :
  - `IS_PRODUCTION` = `true`
  - `FRONTEND_URL` = `https://xxx.amplifyapp.com`
  - `GOOGLE_API_KEY` = (depuis Secrets Manager de préférence)
  - `SUPABASE_URL` = ...
  - `SUPABASE_KEY` = ...
  - `PORT` = `8002`

### Créer le service ECS
```
ECS > Cluster processmate > Services > Create
  Type: Fargate
  Task definition: clinic-task
  Service name: clinic-service
  Desired tasks: 1
  ALB: processmate-alb
  Listener rule: /api/clinic/*
```

### Créer l'IAM user pour GitHub Actions
```
IAM > Users > Create > github-actions-deployer
Permissions (inline policy) :
  - ecr:GetAuthorizationToken
  - ecr:BatchCheckLayerAvailability
  - ecr:GetDownloadUrlForLayer
  - ecr:BatchGetImage
  - ecr:PutImage
  - ecr:InitiateLayerUpload
  - ecr:UploadLayerPart
  - ecr:CompleteLayerUpload
  - ecs:RegisterTaskDefinition
  - ecs:UpdateService
  - ecs:DescribeServices
  - ecs:DescribeTaskDefinition
  - iam:PassRole  (sur le rôle ECS task execution role)
```
Créer une Access Key et noter `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`.

---

## 2. Sur GitHub — Secrets du repo

Aller sur : `github.com/natproces-ui/processMate > Settings > Secrets > Actions`

| Secret | Valeur |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | Clé IAM github-actions-deployer |
| `AWS_SECRET_ACCESS_KEY` | Secret IAM github-actions-deployer |
| `AWS_REGION` | ex: `eu-west-1` |

---

## 3. Déclencher le premier déploiement

Un simple `git push` sur `main` avec des changements dans `clinic/` déclenche le workflow automatiquement.

Pour forcer sans changement de code :
```bash
git commit --allow-empty -m "chore: trigger deploy"
git push
```
