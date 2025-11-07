# DocTalk

The **DocTalk** is a conversational healthcare assistant built using **Flask**, **LangChain**, **Google Generative AI (Gemini)**, **Pinecone**, and **MySQL** hosted on **Google Cloud Platform (GCP)**.  
It enables users to chat with an intelligent medical assistant, manage sessions, and securely store conversations in a MySQL database.

> This project is for educational and research purposes only. It is not a substitute for professional medical advice.

---

## Key Features

- **Flask-based Web App** with authentication (signup/login/logout)
- **Secure user management** using Flask-Login and Bcrypt
- **Session & message storage** using **MySQL on GCP Cloud SQL**
- **Context-aware chatbot** powered by LangChain and Google Gemini API
- **RAG (Retrieval-Augmented Generation)** with **Pinecone Vector Store**
- **Dockerized deployment** for consistent local and cloud environments
- Runs locally on `http://localhost:8080` and supports deployment on **Google Cloud Run**

---

## Project Structure

```
Medical-Chatbot/
│
├── app.py                     # Main Flask application
├── Dockerfile                 # Docker build configuration
├── docker-compose.yml         # For local container orchestration (optional)
├── requirements.txt           # Python dependencies
├── src/
│   ├── helper.py              # Contains embedding download utility
│   └── prompt.py              # System prompt configuration for RAG
├── templates/                 # HTML templates (login, signup, chat interface)
├── static/                    # Frontend static assets (CSS, JS)
├── chat.db                    # SQLite database (local dev mode only)
├── .env                       # Environment variable configuration (ignored in Git)
└── README.md                  # Documentation file
```

---

## Environment Configuration

Create a `.env` file in your project root with the following variables:

```
FLASK_SECRET_KEY=your_secret_key_here
GOOGLE_API_KEY=your_google_genai_api_key
PINECONE_API_KEY=your_pinecone_api_key

# MySQL (GCP Cloud SQL)
MYSQL_HOST=your_mysql_host
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DB=medical_chatbot

# Optional: Detects if running on GCP Cloud Run
K_SERVICE=medical-chatbot
```

Ensure `.env` is listed in your `.gitignore` file to prevent sensitive credentials from being pushed.

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/hvmt2003/Medical-Chatbot.git
cd Medical-Chatbot
```

### 2. Create and Activate a Virtual Environment

```bash
python -m venv venv
```

Activate it:

**Windows:**
```bash
venv\Scripts\activate
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the Flask Application

```bash
python app.py
```

Then open your browser and visit:

```
http://localhost:8080
```

You’ll see the chatbot interface running locally.

---

## Database Configuration

The app is configured to use **MySQL (on GCP)** in production and **SQLite (local)** for development.

### Local (SQLite)
By default, Flask uses a local SQLite database (`chat.db`) located in the project root.

### GCP MySQL (Production)
When deployed to GCP, Flask automatically connects to your Cloud SQL instance using the environment variables defined in `.env` or via Cloud Run Secrets.

If your Cloud SQL instance is private, ensure your Cloud Run service is **authorized to connect** via **VPC Connector**.

---

## GCP Deployment Guide

### 1. Build Docker Image
```bash
gcloud builds submit --tag gcr.io/[PROJECT_ID]/medical-chatbot
```

### 2. Deploy to Cloud Run
```bash
gcloud run deploy medical-chatbot   --image gcr.io/[PROJECT_ID]/medical-chatbot   --platform managed   --region asia-south1   --add-cloudsql-instances [INSTANCE_CONNECTION_NAME]   --set-env-vars FLASK_SECRET_KEY=your_secret_key,GOOGLE_API_KEY=your_google_key,PINECONE_API_KEY=your_pinecone_key,MYSQL_USER=root,MYSQL_PASSWORD=yourpassword,MYSQL_DB=medical_chatbot,INSTANCE_CONNECTION_NAME=[INSTANCE_CONNECTION_NAME]   --allow-unauthenticated
```

### 3. Access the Application
Cloud Run will output a live HTTPS URL such as:
```
https://medical-chatbot-xxxxxx.a.run.app
```

Visit the link to access your deployed chatbot.

---

## LangChain and RAG Integration

The chatbot uses the **LangChain** framework for retrieval-augmented generation (RAG).  
It integrates **Google Gemini (Generative AI)** as the LLM and **Pinecone** as the vector database for contextual search.

**Core Steps:**
1. User submits a query.
2. Bot retrieves relevant documents from Pinecone (`index_name="medical-chatbot"`).
3. Gemini model generates a context-aware answer.
4. Responses are cleaned and stored in MySQL under the user's chat session.

---

## Docker Support

Build and run the app locally using Docker:

```bash
docker build -t medical-chatbot .
docker run -p 8080:8080 medical-chatbot
```

The app will be accessible at `http://localhost:8080`.

---

## Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|-----------|
| Flask app not starting | Missing dependencies | Run `pip install -r requirements.txt` |
| `KeyError: GOOGLE_API_KEY` | Missing .env variable | Check `.env` file and environment configuration |
| Pinecone connection fails | Invalid or missing API key | Verify `PINECONE_API_KEY` |
| MySQL connection error | Incorrect credentials or Cloud SQL configuration | Verify instance name, password, and networking |
| Model fails to respond | Invalid Gemini API key or model name | Ensure `GOOGLE_API_KEY` is valid and `gemini-2.5-flash` model is accessible |

---

## Contributing

You can contribute by:
- Enhancing NLP model logic or integrating new datasets  
- Improving database design and scalability  
- Refining UI/UX for better chat interaction  
- Adding test coverage or CI/CD workflows  

### Steps to Contribute:
1. Fork the repository  
2. Create a feature branch  
3. Commit and push changes  
4. Open a pull request  

---

## License

This project is distributed under the Apache License.  
You may freely use, modify, and distribute this software with appropriate attribution.

---

## Author

**Harshvardhan Mani Tripathi**  
[GitHub Profile](https://github.com/hvmt2003)

For issues or suggestions, please open a GitHub issue or contact via repository discussions.
