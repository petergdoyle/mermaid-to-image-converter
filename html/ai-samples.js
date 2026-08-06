window.AI_REQUIREMENTS_SAMPLES = {
  "categories": [
    {
      "id": "software-engineering",
      "name": "Software Engineering"
    },
    {
      "id": "data-engineering",
      "name": "Data Engineering"
    },
    {
      "id": "mlops",
      "name": "MLOps"
    },
    {
      "id": "cloud-infrastructure",
      "name": "Cloud Infrastructure"
    }
  ],
  "requirements": [
    {
      "id": "sso-mfa-auth",
      "category_id": "software-engineering",
      "name": "SSO & MFA Authentication Flow",
      "prompt": "Illustrate an SSO and Multi-Factor Authentication flow. The user attempts to access a secured client application dashboard. The application checks for a JWT token; since it is missing, the application redirects the user to the Authentik SSO portal. The user inputs credentials, and upon success, Authentik requests a Time-Based One-Time Password (TOTP) token. Once validated, Authentik returns an authorization code, which the client application exchanges on the backend for access, refresh, and ID tokens, subsequently starting the authenticated user session."
    },
    {
      "id": "microservice-outbox-kafka",
      "category_id": "software-engineering",
      "name": "Microservices Sync (Transactional Outbox & Kafka)",
      "prompt": "Diagram a microservices transactional database synchronization using Kafka and the Outbox pattern. A user updates their profile using the User Profile Service. This service writes to both the Profile database table and an Outbox table inside a single database transaction. A Debezium CDC connector reads the Outbox table updates and publishes events to a 'user-profile-updates' Kafka topic. The Notification Service and the Analytics Service both consume events from this topic to update their own databases asynchronously."
    },
    {
      "id": "snowflake-elt-pipeline",
      "category_id": "data-engineering",
      "name": "Snowflake ELT Data Pipeline",
      "prompt": "Describe a Snowflake ELT pipeline. Daily raw transactional data files (in JSON format) land in an AWS S3 bucket. This triggers an AWS SQS event which notifies Snowflake's Snowpipe to auto-ingest the data into a schema-less landing table (using VARIANT data type). A scheduled dbt (data build tool) workflow then runs to parse the JSON and transform the raw data into clean star-schema models (Facts and Dimensions) in a Snowflake Data Warehouse layer."
    },
    {
      "id": "flink-kafka-log-ingestion",
      "category_id": "data-engineering",
      "name": "Real-time Log Ingestion & Threat Detection",
      "prompt": "Model a high-throughput real-time log analysis architecture. Application containers run FluentBit sidecars to stream log data into a Kafka broker cluster. Apache Flink consumes logs from Kafka, aggregates them in 5-minute sliding windows, and executes threat detection rules to spot suspicious IP logins. Flink outputs anomalies to an ElasticSearch database for Kibana dashboards, and writes long-term raw logs to AWS S3 Glacier storage."
    },
    {
      "id": "ml-training-gitops",
      "category_id": "mlops",
      "name": "ML Model Training & GitOps Pipeline",
      "prompt": "Illustrate a model training and GitOps deployment pipeline. Data scientists commit code to GitHub, triggering a GitHub Action that launches a model training job on Kubernetes (Kubeflow). Metrics and model artifacts are tracked using MLflow. If training achieves target metrics, the model is registered, packaged into a Docker container, pushed to ECR, and the ArgoCD GitOps repo manifests are updated to trigger a rollout on the production K8s cluster."
    },
    {
      "id": "feast-online-inference",
      "category_id": "mlops",
      "name": "Real-time ML Inference with Feature Store",
      "prompt": "Diagram a real-time ML inference application. The client sends a credit card transaction request to a Prediction API Gateway. The API fetches online features (recent transactions) from the Feast Feature Store (backed by Redis) and joins them with offline historical features. The prediction engine (Triton Inference Server) receives these combined features, scores the transaction for fraud, logs inputs/outputs for drift monitoring in Snowflake, and returns the prediction to the client."
    },
    {
      "id": "aws-multi-region-ha",
      "category_id": "cloud-infrastructure",
      "name": "AWS Multi-Region High Availability Web App",
      "prompt": "Design an AWS high-availability web architecture spanning us-east-1 and us-west-2. Route 53 acts as the entry point using latency-based routing. Each region has a VPC with an Application Load Balancer routing to an Auto Scaling Group of ECS container tasks. Databases are managed by Amazon Aurora Global Database, where the primary cluster in us-east-1 handles writes, and us-west-2 runs a read-replica cluster with write-forwarding capabilities."
    },
    {
      "id": "kubernetes-gitops-argo",
      "category_id": "cloud-infrastructure",
      "name": "Kubernetes GitOps Deployment Flow",
      "prompt": "Model a Kubernetes deployment pipeline using GitOps. Developers push application code to GitHub. GitHub Actions runs test suites, builds a container image, pushes it to ECR, and opens a Pull Request updating the target tag in a separate GitOps configuration repository. Once the PR is merged, ArgoCD running inside the Kubernetes cluster detects the GitOps repository change, compares the desired state with the actual cluster state, and applies the rolling update."
    }
  ]
};
