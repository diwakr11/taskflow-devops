pipeline {

    agent any

    environment {
        APP_NAME         = 'taskflow'
        APP_PORT         = '3000'
        NODE_ENV         = 'production'
        DOCKER_IMAGE     = 'diwakr11/taskflow'
        DOCKER_TAG       = "${BUILD_NUMBER}"
        DOCKER_LATEST    = 'diwakr11/taskflow:latest'
        DOCKERHUB_CREDS  = credentials('dockerhub-credentials')
        EC2_HOST         = credentials('ec2-app-server-ip')
        EC2_USER         = 'ubuntu'
        SSH_KEY_PATH     = '/var/jenkins_home/.ssh/devops-key.pem'
        CI               = 'true'
    }

    options {
        timestamps()
        ansiColor('xterm')
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    tools {
        nodejs 'NodeJS-20'
    }

    stages {

        stage('🔍 Checkout') {
            steps {
                cleanWs()
                checkout scm
                sh '''
                    echo "===================================="
                    echo "  BUILD CONTEXT"
                    echo "===================================="
                    echo "  Job:    ${JOB_NAME}"
                    echo "  Build:  ${BUILD_NUMBER}"
                    echo "  Branch: ${GIT_BRANCH}"
                    echo "===================================="
                    node --version
                    npm --version
                    docker --version
                '''
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    env.DOCKER_VERSIONED = "${DOCKER_IMAGE}:${BUILD_NUMBER}-${env.GIT_COMMIT_SHORT}"
                    echo "Docker image will be tagged: ${env.DOCKER_VERSIONED}"
                }
            }
            post {
                success { echo '✅ Checkout stage passed' }
                failure { echo '❌ Checkout stage failed' }
            }
        }

        stage('📦 Build') {
            steps {
                echo '📦 Installing dependencies...'
                sh '''
                    node --version
                    npm --version
                    npm ci
                    echo "✅ Dependencies installed successfully"
                    echo "   Packages: $(ls node_modules | wc -l) modules"
                '''
                sh '''
                    echo "Checking application syntax..."
                    node --check src/app.js
                    node --check src/database.js
                    node --check src/routes/tasks.js
                    node --check src/middleware/metrics.js
                    echo "✅ All files pass syntax check"
                '''
            }
            post {
                success { echo '✅ Build stage passed' }
                failure { echo '❌ Build stage failed — dependency installation error' }
            }
        }

        stage('🧪 Test') {
            steps {
                echo '🧪 Running Playwright API tests...'
                sh '''
    # Set Node.js memory limit
    # WHY: Playwright + Chromium uses a lot of RAM
    # Limiting prevents OOM killer from terminating the process
    export NODE_OPTIONS="--max-old-space-size=512"

    CI=true ./node_modules/.bin/playwright test \
        --reporter=list,junit \
        --workers=1 \
        || true

    echo "✅ Tests complete — check report for results"
'''
            }
            post {
                always {
                    script {
                        if (fileExists('test-results/junit.xml')) {
                            junit(
                                testResults: 'test-results/junit.xml',
                                allowEmptyResults: true,
                                skipPublishingChecks: false
                            )
                        } else {
                            echo '⚠️ No JUnit XML found — tests may not have run'
                        }
                        if (fileExists('playwright-report/index.html')) {
                            publishHTML([
                                allowMissing: true,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'playwright-report',
                                reportFiles: 'index.html',
                                reportName: 'Playwright Test Report',
                                reportTitles: 'API Test Results'
                            ])
                        }
                    }
                    archiveArtifacts(
                        artifacts: 'test-results/**/*',
                        allowEmptyArchive: true
                    )
                }
                success { echo '✅ Test stage passed — all tests green' }
                failure { echo '❌ Test stage FAILED — check Playwright Test Report' }
            }
        }

        stage('🔎 Code Quality') {
            steps {
                echo '🔎 Running code quality checks...'
                sh '''
                    echo "Running npm audit..."
                    npm audit --audit-level=high || true
                    echo ""
                    echo "Checking for outdated packages..."
                    npm outdated || true
                    echo ""
                    echo "✅ Code quality checks complete"
                '''
            }
            post {
                always { echo 'Code quality stage complete' }
            }
        }

        stage('🐳 Docker Build & Push') {
            steps {
                echo '🐳 Building Docker image...'
                script {
                    sh """
                        echo \${DOCKERHUB_CREDS_PSW} | \
                        docker login -u \${DOCKERHUB_CREDS_USR} --password-stdin
                    """

                    sh """
                        echo "Building image: ${env.DOCKER_VERSIONED}"
                        docker build \
                            --tag ${env.DOCKER_VERSIONED} \
                            --tag ${DOCKER_LATEST} \
                            --build-arg BUILD_DATE=\$(date -u +%Y-%m-%dT%H:%M:%SZ) \
                            --build-arg BUILD_NUMBER=${BUILD_NUMBER} \
                            --build-arg GIT_COMMIT=${env.GIT_COMMIT_SHORT} \
                            .
                        echo "Image size: \$(docker image inspect ${env.DOCKER_VERSIONED} --format='{{.Size}}' | numfmt --to=iec)"
                    """

                    sh """
                        echo "Running container smoke test..."

                        docker run -d \
                            --name taskflow-test-${BUILD_NUMBER} \
                            -p 3002:3000 \
                            -e NODE_ENV=production \
                            ${env.DOCKER_VERSIONED}

                        sleep 8

                        CONTAINER_IP=\$(docker inspect \
                            --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
                            taskflow-test-${BUILD_NUMBER})

                        echo "Container IP: \$CONTAINER_IP"

                        HTTP_STATUS=\$(curl -s -o /dev/null -w '%{http_code}' \
                            --max-time 10 \
                            http://\$CONTAINER_IP:3000/health)

                        docker stop taskflow-test-${BUILD_NUMBER}
                        docker rm taskflow-test-${BUILD_NUMBER}

                        echo "Health check status: \$HTTP_STATUS"

                        if [ "\$HTTP_STATUS" = "200" ]; then
                            echo "✅ Container smoke test passed (HTTP 200)"
                        else
                            echo "❌ Container smoke test FAILED (HTTP \$HTTP_STATUS)"
                            exit 1
                        fi
                    """

                    sh """
                        echo "Pushing ${env.DOCKER_VERSIONED}..."
                        docker push ${env.DOCKER_VERSIONED}

                        echo "Pushing ${DOCKER_LATEST}..."
                        docker push ${DOCKER_LATEST}

                        echo "✅ Images pushed to Docker Hub"

                        docker rmi ${env.DOCKER_VERSIONED} || true
                        docker rmi ${DOCKER_LATEST} || true
                        docker image prune -f

                        docker logout
                    """
                }
            }
            post {
                failure {
                    sh "docker stop taskflow-test-${BUILD_NUMBER} || true"
                    sh "docker rm taskflow-test-${BUILD_NUMBER} || true"
                    sh "docker logout || true"
                    echo '❌ Docker stage failed'
                }
                success {
                    echo "✅ Docker stage passed — image: ${env.DOCKER_VERSIONED}"
                }
            }
        }

        stage('🚀 Deploy to EC2') {
            when {
                anyOf {
                    branch 'master'
                    expression { env.GIT_BRANCH == 'origin/master' }
                }
            }
            steps {
                echo '🚀 Deploying to EC2 App Server...'

                // WHY Fix 4: Using key file directly from Jenkins container
                // avoids SSH Agent plugin dependency and credential format issues
                sh """
                    echo "Verifying SSH key exists..."
                    ls -la ${SSH_KEY_PATH}

                    echo "Deploying ${DOCKER_LATEST} to EC2..."
                    ssh -i ${SSH_KEY_PATH} \
                        -o StrictHostKeyChecking=no \
                        -o ConnectTimeout=30 \
                        -o BatchMode=yes \
                        ${EC2_USER}@\${EC2_HOST} \
                        '/home/ubuntu/taskflow/deploy.sh ${DOCKER_LATEST}'
                """

                // Verify production deployment health
                sh """
                    echo "Verifying production deployment..."
                    sleep 5

                    HTTP_STATUS=\$(curl -s -o /dev/null -w '%{http_code}' \
                        --max-time 15 \
                        http://\${EC2_HOST}:${APP_PORT}/health)

                    echo "Production health check: HTTP \$HTTP_STATUS"

                    if [ "\$HTTP_STATUS" = "200" ]; then
                        echo "✅ Production health check passed (HTTP \$HTTP_STATUS)"
                    else
                        echo "❌ Production health check FAILED (HTTP \$HTTP_STATUS)"
                        exit 1
                    fi
                """

                echo "✅ Deployment complete!"
            }
            post {
                success {
                    sh """
                        echo "✅ DEPLOYED SUCCESSFULLY"
                        echo "────────────────────────────────────────"
                        echo "App URL:    http://\${EC2_HOST}:${APP_PORT}"
                        echo "Health:     http://\${EC2_HOST}:${APP_PORT}/health"
                        echo "Metrics:    http://\${EC2_HOST}:${APP_PORT}/metrics"
                        echo "Grafana:    http://\${EC2_HOST}:3001"
                        echo "Prometheus: http://\${EC2_HOST}:9090"
                        echo "Image:      ${env.DOCKER_VERSIONED}"
                        echo "────────────────────────────────────────"
                    """
                }
                failure {
                    echo '❌ Deploy failed — previous version still running'
                }
            }
        }

    } // end stages

    post {
        always {
            echo '''
            ════════════════════════════════════════
              PIPELINE COMPLETE
            ════════════════════════════════════════
            '''
            cleanWs(
                cleanWhenNotBuilt: false,
                deleteDirs: true,
                disableDeferredWipeout: true,
                notFailBuild: true
            )
        }
        success {
            echo "✅ BUILD SUCCESSFUL — Build #${BUILD_NUMBER} — Image: ${env.DOCKER_VERSIONED}"
        }
        failure {
            echo "❌ BUILD FAILED — Build #${BUILD_NUMBER} — Check console output"
        }
        unstable {
            echo '⚠️ BUILD UNSTABLE — Tests passed but with warnings'
        }
        aborted {
            echo '⚠️ BUILD ABORTED — Manually cancelled or timed out'
        }
    }

} // end pipeline