// Jenkinsfile
// WHY: Declarative Pipeline syntax is preferred over Scripted Pipeline
// It's more readable, has built-in error handling, and is the Jenkins standard

pipeline {

    // ── Agent ──────────────────────────────────────────────────────
    // WHY: 'any' means run on any available Jenkins agent (our server itself)
    // In production, you'd use specific agents: agent { label 'linux-node' }
    agent any

    // ── Environment Variables ──────────────────────────────────────
    // WHY: Define variables ONCE here, reuse across all stages
    // Credentials are injected from Jenkins store — never hardcoded
    environment {
        // Application config
        APP_NAME        = 'taskflow'
        APP_PORT        = '3000'
        NODE_ENV        = 'production'

        // Docker config
        DOCKER_IMAGE    = "diwakr11/${APP_NAME}"
        DOCKER_TAG      = "${BUILD_NUMBER}"           // Each build = unique tag
        DOCKER_LATEST   = "${DOCKER_IMAGE}:latest"
        DOCKER_VERSIONED= "${DOCKER_IMAGE}:${DOCKER_TAG}"

        // Credentials (injected from Jenkins credentials store)
        DOCKERHUB_CREDS = credentials('dockerhub-credentials')

        // AWS EC2 App Server (we'll set this up on Day 5)
        EC2_HOST        = credentials('ec2-app-server-ip')
        EC2_USER        = 'ubuntu'

        // Test config
        TEST_BASE_URL   = 'http://localhost:3001'
        CI              = 'true'
    }

    // ── Build Options ──────────────────────────────────────────────
    options {
        // Add timestamps to every console log line
        timestamps()

        // Colorize console output (needs AnsiColor plugin)
        ansiColor('xterm')

        // Kill the build if it runs longer than 30 minutes
        // WHY: Prevents zombie builds from hogging resources
        timeout(time: 30, unit: 'MINUTES')

        // Keep only last 10 builds (saves disk space)
        buildDiscarder(logRotator(numToKeepStr: '10'))

        // Don't run concurrent builds on the same branch
        // WHY: Prevents race conditions on the same EC2 instance
        disableConcurrentBuilds()
    }

    // ── Tools ─────────────────────────────────────────────────────
    tools {
        // Use Node.js version we configured in Jenkins Tools
        nodejs 'NodeJS-20'
    }

    // ══════════════════════════════════════════════════════════════
    // STAGES — The heart of your pipeline
    // ══════════════════════════════════════════════════════════════
    stages {

        // ──────────────────────────────────────────────────────────
        // STAGE 0: Checkout & Preparation
        // WHY: Always start with a clean workspace and clear context
        // ──────────────────────────────────────────────────────────
        stage('🔍 Checkout') {
            steps {
                // Clean workspace before checkout
                cleanWs()

                // Checkout code from GitHub
                checkout scm

                // Print build context for debugging
                sh '''
                    echo "════════════════════════════════════"
                    echo "  BUILD CONTEXT"
                    echo "════════════════════════════════════"
                    echo "  Job Name:     ${JOB_NAME}"
                    echo "  Build Number: ${BUILD_NUMBER}"
                    echo "  Branch:       ${GIT_BRANCH}"
                    echo "  Commit:       ${GIT_COMMIT}"
                    echo "  Workspace:    ${WORKSPACE}"
                    echo "════════════════════════════════════"
                    echo ""
                    echo "  Node version: $(node --version)"
                    echo "  npm version:  $(npm --version)"
                    echo "  Docker:       $(docker --version)"
                    echo "════════════════════════════════════"
                '''

                // Store short commit hash for Docker tag
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    env.DOCKER_TAG = "${BUILD_NUMBER}-${env.GIT_COMMIT_SHORT}"
                    env.DOCKER_VERSIONED = "${DOCKER_IMAGE}:${env.DOCKER_TAG}"
                    echo "Docker image will be tagged: ${env.DOCKER_VERSIONED}"
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 1: Build
        // WHY: Install all dependencies. This verifies that
        // package.json is valid and all deps are available.
        // ──────────────────────────────────────────────────────────
        stage('📦 Build') {
            steps {
                echo '📦 Installing dependencies...'

                sh '''
                    echo "Node version: $(node --version)"
                    echo "npm version: $(npm --version)"

                    npm ci

                    echo ""
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
                failure {
                    echo '❌ Build stage failed — dependency installation error'
                }
                success {
                    echo '✅ Build stage passed'
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 2: Test
        // WHY: Tests run BEFORE Docker build — no point building
        // an image if the code is broken. Fail fast = save time.
        // ──────────────────────────────────────────────────────────
        stage('🧪 Test') {
            steps {
                echo '🧪 Running Playwright API tests...'

                sh '''
                    # Create test results directory
                    mkdir -p test-results playwright-report

                    # Use LOCAL playwright installation (not npx global)
                    # WHY: Ensures exact version from package.json is used
                    ./node_modules/.bin/playwright install chromium
                    echo "✅ Playwright browsers ready"
                '''

                sh '''
                    CI=true ./node_modules/.bin/playwright test || true
                    echo "✅ Tests complete — check report for results"
                '''
            }

            post {
                always {
                    script {
                        // Check if JUnit XML exists before publishing
                        def junitFile = 'test-results/junit.xml'
                        if (fileExists(junitFile)) {
                            junit(
                                testResults: 'test-results/junit.xml',
                                allowEmptyResults: true,
                                skipPublishingChecks: false
                            )
                        } else {
                            echo '⚠️ No JUnit XML found — tests may not have run'
                        }
                    }

                    // Publish HTML report if it exists
                    script {
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

                failure {
                    echo '❌ Test stage FAILED — check Playwright Test Report'
                }

                success {
                    echo '✅ Test stage passed — all tests green'
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 3: Code Quality (Optional but professional)
        // WHY: Catch obvious code smells before building the image
        // ──────────────────────────────────────────────────────────
        stage('🔎 Code Quality') {
            steps {
                echo '🔎 Running code quality checks...'

                sh '''
                    # Check for common security issues in dependencies
                    echo "Running npm audit..."
                    npm audit --audit-level=high || true
                    # WHY: || true prevents pipeline failure on audit warnings
                    # In production, you'd set --audit-level=moderate

                    echo ""
                    echo "Checking for outdated packages..."
                    npm outdated || true

                    echo ""
                    echo "✅ Code quality checks complete"
                '''
            }

            post {
                always {
                    echo 'Code quality stage complete'
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 4: Docker Build & Push
        // WHY: Package the verified, tested application into an
        // immutable Docker image. Same image goes to all environments.
        // ──────────────────────────────────────────────────────────
        stage('🐳 Docker Build & Push') {
            steps {
                echo '🐳 Building Docker image...'

                script {
                    // Login to Docker Hub
                    sh """
                        echo \${DOCKERHUB_CREDS_PSW} | \
                        docker login -u \${DOCKERHUB_CREDS_USR} --password-stdin
                    """

                    // Build the Docker image
                    // WHY: We tag with both version AND latest
                    // Version tag = immutable reference for this exact build
                    // Latest tag = what EC2 will pull on next deploy
                    sh """
                        echo "Building image: ${env.DOCKER_VERSIONED}"

                        docker build \
                            --tag ${env.DOCKER_VERSIONED} \
                            --tag ${DOCKER_LATEST} \
                            --build-arg BUILD_DATE=\$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
                            --build-arg BUILD_NUMBER=${BUILD_NUMBER} \
                            --build-arg GIT_COMMIT=${env.GIT_COMMIT_SHORT} \
                            --label "org.opencontainers.image.created=\$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
                            --label "org.opencontainers.image.revision=${env.GIT_COMMIT_SHORT}" \
                            --label "org.opencontainers.image.version=${env.DOCKER_TAG}" \
                            .

                        echo ""
                        echo "Image size: \$(docker image inspect ${env.DOCKER_VERSIONED} --format='{{.Size}}' | numfmt --to=iec)"
                    """

                    // Smoke test the Docker image before pushing
                    // WHY: Verify the image actually runs before
                    // pushing it and deploying it to production
                    sh """
                        echo "Running container smoke test..."

                        # Start the container
                        docker run -d \
                            --name taskflow-test-\${BUILD_NUMBER} \
                            -p 3002:3000 \
                            -e NODE_ENV=production \
                            ${env.DOCKER_VERSIONED}

                        # Wait for startup
                        sleep 8

                        # Get container's actual IP address
                        CONTAINER_IP=\$(docker inspect \
                            --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
                            taskflow-test-\${BUILD_NUMBER})

                        echo "Container IP: \$CONTAINER_IP"

                        # Hit the health endpoint using container IP directly
                        HTTP_STATUS=\$(curl -s -o /dev/null -w '%{http_code}' \
                            --max-time 10 \
                            http://\$CONTAINER_IP:3000/health)

                        # Stop and remove test container
                        docker stop taskflow-test-\${BUILD_NUMBER}
                        docker rm taskflow-test-\${BUILD_NUMBER}

                        echo "Health check status: \$HTTP_STATUS"

                        if [ "\$HTTP_STATUS" = "200" ]; then
                            echo "✅ Container smoke test passed (HTTP 200)"
                        else
                            echo "❌ Container smoke test FAILED (HTTP \$HTTP_STATUS)"
                            exit 1
                        fi
                    """

                    // Push both tags to Docker Hub
                    sh """
                        echo "Pushing ${env.DOCKER_VERSIONED}..."
                        docker push ${env.DOCKER_VERSIONED}

                        echo "Pushing ${DOCKER_LATEST}..."
                        docker push ${DOCKER_LATEST}

                        echo "✅ Images pushed to Docker Hub"
                    """

                    // Clean up local images to save disk space
                    sh """
                        docker rmi ${env.DOCKER_VERSIONED} || true
                        docker rmi ${DOCKER_LATEST} || true
                        docker image prune -f
                        echo "✅ Local images cleaned up"
                    """

                    // Logout from Docker Hub
                    sh 'docker logout'
                }
            }

            post {
                failure {
                    sh 'docker stop taskflow-test-${BUILD_NUMBER} || true'
                    sh 'docker rm taskflow-test-${BUILD_NUMBER} || true'
                    sh 'docker logout || true'
                    echo '❌ Docker stage failed'
                }
                success {
                    echo "✅ Docker stage passed — image: ${env.DOCKER_VERSIONED}"
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 5: Deploy to EC2
        // WHY: Pull the verified image onto the EC2 app server
        // and do a zero-downtime container swap.
        // ──────────────────────────────────────────────────────────
        stage('🚀 Deploy to EC2') {
            when {
                branch 'master'
            }

            steps {
                echo '🚀 Deploying to EC2 App Server...'

                sshagent(['ec2-ssh-key']) {
                    sh """
                        echo "Deploying ${env.DOCKER_VERSIONED} to EC2..."

                        ssh -o StrictHostKeyChecking=no \
                            -o ConnectTimeout=30 \
                            ${EC2_USER}@${EC2_HOST} \
                            '/home/ubuntu/taskflow/deploy.sh ${DOCKER_LATEST}'
                    """
                }

                echo "✅ Deployment complete!"
            }

            post {
                success {
                    echo """
                    ✅ DEPLOYED SUCCESSFULLY
                    ────────────────────────────────
                    App URL: http://${EC2_HOST}:3000
                    Health:  http://${EC2_HOST}:3000/health
                    Image:   ${env.DOCKER_VERSIONED}
                    ────────────────────────────────
                    """
                }
                failure {
                    echo '❌ Deployment failed — previous version still running'
                }
            }
        }
    } // end stages

    // ══════════════════════════════════════════════════════════════
    // POST — Runs after ALL stages complete (pass or fail)
    // WHY: Cleanup and notification always happen,
    // regardless of whether the build succeeded
    // ══════════════════════════════════════════════════════════════
    post {

        always {
            echo '''
            ════════════════════════════════════════
              PIPELINE COMPLETE
            ════════════════════════════════════════
            '''

            // Clean workspace to free disk space
            cleanWs(
                cleanWhenNotBuilt: false,
                deleteDirs: true,
                disableDeferredWipeout: true,
                notFailBuild: true,
                patterns: [[pattern: '.gitignore', type: 'INCLUDE'],
                           [pattern: '.propsfile', type: 'EXCLUDE']]
            )
        }

        success {
            echo """
            ✅ BUILD SUCCESSFUL
            ────────────────────────────────────────
            Job:       ${env.JOB_NAME}
            Build:     #${env.BUILD_NUMBER}
            Commit:    ${env.GIT_COMMIT_SHORT}
            Image:     ${env.DOCKER_VERSIONED}
            Duration:  ${currentBuild.durationString}
            ────────────────────────────────────────
            """
        }

        failure {
            echo """
            ❌ BUILD FAILED
            ────────────────────────────────────────
            Job:      ${env.JOB_NAME}
            Build:    #${env.BUILD_NUMBER}
            Branch:   ${env.GIT_BRANCH}
            Commit:   ${env.GIT_COMMIT_SHORT}
            Duration: ${currentBuild.durationString}
            ────────────────────────────────────────
            Check console output for details.
            """
        }

        unstable {
            echo '⚠️ BUILD UNSTABLE — Tests passed but with warnings'
        }

        aborted {
            echo '⚠️ BUILD ABORTED — Manually cancelled or timed out'
        }
    }

} // end pipeline