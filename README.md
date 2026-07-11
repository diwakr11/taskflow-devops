# 🚀 TaskFlow DevOps Project

[![Build Status](http://JENKINS_EC2_IP:8080/buildStatus/icon?job=taskflow-pipeline)](http://JENKINS_EC2_IP:8080/job/taskflow-pipeline/)

A complete end-to-end DevOps project demonstrating:
- Node.js REST API with SQLite
- Playwright API testing (35 tests)
- Jenkins CI/CD pipeline
- Docker containerization
- AWS EC2 deployment
- Prometheus + Grafana monitoring

## Pipeline Stages
| Stage | Purpose |
|-------|---------|
| 🔍 Checkout | Clean workspace, print build context |
| 📦 Build | `npm ci` — reproducible dependency install |
| 🧪 Test | 35 Playwright API tests + JUnit + HTML reports |
| 🔎 Code Quality | npm audit security scan |
| 🐳 Docker | Build, smoke test, push to Docker Hub |
| 🚀 Deploy | Zero-downtime swap on EC2 (main branch only) |

## Local Development
```bash
npm install
npm run dev       # Start dev server
npm test          # Run test suite
```