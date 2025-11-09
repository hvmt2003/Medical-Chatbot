# --- Flask & General Imports ---
import sys
import os
import re
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_bcrypt import Bcrypt
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user, UserMixin

# --- LangChain & AI Imports ---
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains.retrieval import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_pinecone import PineconeVectorStore

# --- Local Imports ---
# Ensure 'src' folder exists with helper.py and prompt.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from src.helper import download_embeddings
from src.prompt import system_prompt

# -------------------------------------------------
# 1. App & Environment Setup
# -------------------------------------------------
load_dotenv()

project_root = os.path.abspath(os.path.dirname(__file__))
template_dir = os.path.join(project_root, 'templates')
static_dir = os.path.join(project_root, 'static')

app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

# Check if running on Google Cloud Run (K_SERVICE is always set there)
IS_ON_GCP = os.getenv("K_SERVICE") is not None

# --- Secure session config (Conditional for Cloud/Local) ---
app.config.update(
    # Set to True on GCP (HTTPS), False locally (HTTP).
    SESSION_COOKIE_SECURE=IS_ON_GCP, 
    # Set to 'None' on GCP, 'Lax' locally for better HTTP compatibility.
    SESSION_COOKIE_SAMESITE="None" if IS_ON_GCP else "Lax",
)

# CRITICAL: Set this in Vercel Environment Variables for security!
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret_key_do_not_use_in_prod")

bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"


# 2. Smart Database Configuration (Local = SQLite, Cloud = MySQL)
# -------------------------------------------------
from urllib.parse import quote_plus

# URL-encoded password (important)
encoded_password = "P05tgre5qld%40t%40b%40ase"

if IS_ON_GCP:
    # --- Cloud Run / Deployed environment ---
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        f"mysql+pymysql://docktalk-db:{encoded_password}"
        f"@//cloudsql/bamboo-analyst-477309-n3:asia-south1:docktalk-db/doctalk"
    )
else:
    # --- Local development (data stored in your computer) ---
    db_path = os.path.join(project_root, 'chat.db')
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


# 3. Database Models
# -------------------------------------------------
class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    sessions = db.relationship("ChatSession", backref="user", lazy=True, cascade="all, delete-orphan")

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

class ChatSession(db.Model):
    __tablename__ = "chat_sessions"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), default="New Chat")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    messages = db.relationship("ChatMessage", backref="session", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        last_message = ChatMessage.query.filter_by(session_id=self.id).order_by(ChatMessage.timestamp.desc()).first()
        return {"id": self.id, "title": self.title, "snippet": last_message.content if last_message else ""}

class ChatMessage(db.Model):
    __tablename__ = "chat_messages"
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("chat_sessions.id"), nullable=False)
    role = db.Column(db.String(10))  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"role": self.role, "content": self.content}

# CRITICAL FIX: Create tables GLOBALLY so Vercel sees them on cold start
with app.app_context():
    db.create_all()

# -------------------------------------------------
# 4. LangChain & AI Setup
# -------------------------------------------------
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not PINECONE_API_KEY or not GOOGLE_API_KEY:
    print(" WARNING: API keys missing! AI features will fail.")

embeddings = download_embeddings()
index_name = "medical-chatbot"

# Connect to Pinecone
docsearch = PineconeVectorStore.from_existing_index(index_name=index_name, embedding=embeddings)
retriever = docsearch.as_retriever(search_type="similarity", search_kwargs={"k": 3})

# Setup Gemini Model
model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3, google_api_key=GOOGLE_API_KEY)
question_answer_chain = create_stuff_documents_chain(model, system_prompt)
rag_chain = create_retrieval_chain(retriever, question_answer_chain)

# -------------------------------------------------
# 5. Helper Functions
# -------------------------------------------------
def clean_format(text: str) -> str:
    """Cleans up bot response formatting for better display."""
    text = re.sub(r"\*\*", "", text)
    text = re.sub(r"(\d\.)", r"\n•", text)
    text = re.sub(r"\s*•", r"\n•", text)
    text = re.sub(r"([.!?]) ", r"\1\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

# -------------------------------------------------
# 6. Routes: Authentication
# -------------------------------------------------
@app.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("chat_page"))
    return redirect(url_for("login"))

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = request.form.get("name")
        email = request.form.get("email")
        password = request.form.get("password")

        if User.query.filter_by(email=email).first():
            flash("Email already registered!", "warning")
            return redirect(url_for("signup"))

        hashed_pw = bcrypt.generate_password_hash(password).decode("utf-8")
        new_user = User(name=name, email=email, password=hashed_pw)
        db.session.add(new_user)
        db.session.commit()
        flash("Signup successful! Please log in.", "success")
        return redirect(url_for("login"))
    return render_template("signup.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        user = User.query.filter_by(email=email).first()

        if user and bcrypt.check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for("chat_page"))
        flash("Invalid email or password.", "danger")
    return render_template("login.html")

@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.", "info")
    return redirect(url_for("login"))

# -------------------------------------------------
# 7. Routes: Chat Interface & API
# -------------------------------------------------
@app.route("/chat")
@login_required
def chat_page():
    return render_template("chat.html", user=current_user)

@app.route("/api/chats", methods=["GET", "POST"])
@login_required
def handle_chats():
    if request.method == "POST":
        title = request.json.get("title", "New Chat")
        session = ChatSession(user_id=current_user.id, title=title)
        db.session.add(session)
        db.session.commit()
        return jsonify(session.to_dict())
    else:
        sessions = ChatSession.query.filter_by(user_id=current_user.id).order_by(ChatSession.created_at.desc()).all()
        return jsonify([s.to_dict() for s in sessions])

@app.route("/api/chats/<int:session_id>", methods=["DELETE"])
@login_required
def delete_chat_session(session_id):
    session_obj = db.session.get(ChatSession, session_id)
    if not session_obj or session_obj.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    db.session.delete(session_obj)
    db.session.commit()
    return jsonify({"success": True})

@app.route("/api/chats/<int:session_id>/messages", methods=["GET"])
@login_required
def get_chat_messages(session_id):
    session_obj = db.session.get(ChatSession, session_id)
    if not session_obj or session_obj.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    messages = ChatMessage.query.filter_by(session_id=session_obj.id).order_by(ChatMessage.timestamp.asc()).all()
    return jsonify([m.to_dict() for m in messages])

@app.route("/api/chats/<int:session_id>/rename", methods=["POST"])
@login_required
def rename_chat_session(session_id):
    session_obj = db.session.get(ChatSession, session_id)
    if not session_obj or session_obj.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    new_title = request.json.get("title")
    if not new_title:
        return jsonify({"error": "Title is required"}), 400
    session_obj.title = new_title
    db.session.commit()
    return jsonify(session_obj.to_dict())

# -------------------------------------------------
# 8. Main Chatbot Logic Route
# -------------------------------------------------
@app.route("/get", methods=["POST"])
@login_required
def chat_response():
    try:
        data = request.get_json()
        user_input = data.get("msg")
        session_id = data.get("session_id")

        if not user_input or not session_id:
            return jsonify({"error": "Missing 'msg' or 'session_id'"}), 400

        session_obj = db.session.get(ChatSession, session_id)
        if not session_obj or session_obj.user_id != current_user.id:
            return jsonify({"error": "Session not found or unauthorized"}), 404

        # --- Context Retrieval ---
        previous_messages = (
            ChatMessage.query.filter_by(session_id=session_id)
            .order_by(ChatMessage.timestamp.desc())
            .limit(6)
            .all()[::-1]
        )
        history = "\n".join([f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}" for m in previous_messages])

        # --- RAG Generation ---
        system_context = "You are DocTalk, a knowledgeable medical assistant. Answer safely and professionally in English only.\n\n"
        full_input = f"{system_context}Chat History:\n{history}\n\nCurrent Query: {user_input}\nAssistant:"
        
        response = rag_chain.invoke({"input": full_input})
        bot_reply = clean_format(response["answer"])

        # --- Save to DB ---
        db.session.add(ChatMessage(session_id=session_id, role="user", content=user_input))
        db.session.add(ChatMessage(session_id=session_id, role="assistant", content=bot_reply))
        db.session.commit()

        # --- Auto-Title for New Chats ---
        if session_obj.title == "New Chat":
            # Resolved Conflict: using consistent indentation and quotes
            short_title = ' '.join(user_input.split()[:4]) + "..."
            session_obj.title = short_title
            db.session.commit()

        return jsonify({"reply": bot_reply})

    except Exception as e:
        print(f"Error in chat_response: {e}")
        return jsonify({"error": str(e)}), 500

# -------------------------------------------------
# 9. Local Execution Block
# -------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)