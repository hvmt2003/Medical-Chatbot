# --- This is the 3-line fix ---
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
# --- End of fix ---

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_bcrypt import Bcrypt
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user, UserMixin
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains.retrieval import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from dotenv import load_dotenv
from src.helper import download_embeddings
from src.prompt import *
from deep_translator import GoogleTranslator
from langdetect import detect
from datetime import datetime
import re

# -------------------------------------------------
# Flask app setup
# -------------------------------------------------
load_dotenv()

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Set the template and static folder paths using the project root
template_dir = os.path.join(project_root, 'templates')
static_dir = os.path.join(project_root, 'static')

# Initialize the Flask app with the correct *absolute* paths
app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "super_secret_key")

bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"

# --- Smart Database Configuration (Works Locally AND on Vercel) ---
# Check if we are running on Vercel by looking for their standard env variable
IS_ON_VERCEL = os.getenv("VERCEL") == "1"

if IS_ON_VERCEL:
    # On Vercel, use the only writable directory: /tmp
    # WARNING: Data in /tmp is NOT permanent and resets frequently.
    db_path = os.path.join('/tmp', 'chat.db')
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
else:
    # On your local machine, use the original path
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(BASE_DIR, 'chat.db')
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)
with app.app_context():
    db.create_all()
# --- End of Smart Configuration ---

# -------------------------------------------------
# Database models
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


# -------------------------------------------------
# LangChain setup (Gemini + Pinecone)
# -------------------------------------------------
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
os.environ["PINECONE_API_KEY"] = PINECONE_API_KEY or ""
os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY or ""

embeddings = download_embeddings()
index_name = "medical-chatbot"
docsearch = PineconeVectorStore.from_existing_index(index_name=index_name, embedding=embeddings)
retriever = docsearch.as_retriever(search_type="similarity", search_kwargs={"k": 3})

model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.2)
question_answer_chain = create_stuff_documents_chain(model, system_prompt)
rag_chain = create_retrieval_chain(retriever, question_answer_chain)


# -------------------------------------------------
# Utility function
# -------------------------------------------------
def clean_format(text: str) -> str:
    text = re.sub(r"\*\*", "", text)
    text = re.sub(r"(\d\.)", r"\n•", text)
    text = re.sub(r"\s*•", r"\n•", text)
    text = re.sub(r"([.!?]) ", r"\1\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # remove 'Namaste' or similar greetings from bot responses
    text = re.sub(r"(?i)\bNamaste\b[!.]*", "", text)
    return text.strip()


# -------------------------------------------------
# Auth routes (manual only)
# -------------------------------------------------
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = request.form["name"]
        email = request.form["email"]
        password = bcrypt.generate_password_hash(request.form["password"]).decode("utf-8")

        if User.query.filter_by(email=email).first():
            flash("Email already registered!", "warning")
            return redirect(url_for("signup"))

        new_user = User(name=name, email=email, password=password)
        db.session.add(new_user)
        db.session.commit()
        flash("Signup successful! Please log in.", "success")
        return redirect(url_for("login"))

    return render_template("signup.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
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
    flash("You’ve been logged out successfully.", "info")
    return redirect(url_for("login"))


@app.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("chat_page"))
    return redirect(url_for("login"))


# -------------------------------------------------
# Chat page
# -------------------------------------------------
@app.route("/chat")
@login_required
def chat_page():
    return render_template("chat.html", user=current_user)


# -------------------------------------------------
# Chat APIs
# -------------------------------------------------
@app.route("/api/chats", methods=["GET"])
@login_required
def get_chats():
    sessions = ChatSession.query.filter_by(user_id=current_user.id).order_by(ChatSession.created_at.desc()).all()
    return jsonify([s.to_dict() for s in sessions])


@app.route("/api/chats", methods=["POST"])
@login_required
def create_chat():
    title = request.json.get("title", "New Chat")
    session = ChatSession(user_id=current_user.id, title=title)
    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict())


@app.route("/api/chats/<int:session_id>/messages", methods=["GET"])
@login_required
def get_messages(session_id):
    session_obj = db.session.get(ChatSession, session_id)
    if not session_obj or session_obj.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    messages = ChatMessage.query.filter_by(session_id=session_obj.id).order_by(ChatMessage.timestamp.asc()).all()
    return jsonify([m.to_dict() for m in messages])


@app.route("/api/chats/<int:session_id>/rename", methods=["POST"])
@login_required
def rename_chat(session_id):
    session_obj = db.session.get(ChatSession, session_id)
    if not session_obj or session_obj.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    title = request.json.get("title")
    if not title:
        return jsonify({"error": "Title is required"}), 400
    session_obj.title = title
    db.session.commit()
    return jsonify(session_obj.to_dict())


@app.route("/api/chats/<int:session_id>", methods=["DELETE"])
@login_required
def delete_chat(session_id):
    session_obj = db.session.get(ChatSession, session_id)
    if not session_obj or session_obj.user_id != current_user.id:
        return jsonify({"error": "Unauthorized"}), 403
    db.session.delete(session_obj)
    db.session.commit()
    return jsonify({"success": True})


# -------------------------------------------------
# Chatbot route (with context memory)
# -------------------------------------------------
@app.route("/get", methods=["POST"])
@login_required
def chat():
    try:
        data = request.get_json()
        user_input = data.get("msg")
        session_id = data.get("session_id")

        if not user_input or not session_id:
            return jsonify({"error": "Invalid request. 'msg' and 'session_id' are required."}), 400

        session_obj = db.session.get(ChatSession, session_id)
        if not session_obj or session_obj.user_id != current_user.id:
            return jsonify({"error": "Session not found or unauthorized"}), 404

        # Detect and translate language
        try:
            user_lang = detect(user_input)
        except Exception:
            user_lang = "en"
        if user_lang not in ["hi", "en", "gu", "mr", "ta", "te", "bn", "kn", "ml", "pa", "ur"]:
            user_lang = "en"

        translated_input = (
            GoogleTranslator(source="auto", target="en").translate(user_input)
            if user_lang != "en"
            else user_input
        )

        # 🧠 Retrieve previous messages for context (last 5 exchanges)
        previous_messages = (
            ChatMessage.query.filter_by(session_id=session_id)
            .order_by(ChatMessage.timestamp.desc())
            .limit(6)
            .all()[::-1]
        )

        history = "\n".join(
            [f"User: {m.content}" if m.role == "user" else f"Assistant: {m.content}" for m in previous_messages]
        )

        # System context for professionalism
        system_context = (
            "You are DocTalk, a polite and knowledgeable Indian medical assistant chatbot. "
            "Answer clearly, safely, and professionally. Do not greet with 'Namaste' or repetitive phrases.\n\n"
        )

        full_input = f"{system_context}{history}\nUser: {translated_input}\nAssistant:"

        # Generate contextual response
        response = rag_chain.invoke({"input": full_input})
        english_reply = clean_format(response["answer"])

        # Translate back
        bot_reply = (
            GoogleTranslator(source="en", target=user_lang).translate(english_reply)
            if user_lang != "en"
            else english_reply
        )

        # Save to DB
        # Save chat messages
        db.session.add_all([
            ChatMessage(session_id=session_obj.id, role="user", content=user_input),
            ChatMessage(session_id=session_obj.id, role="assistant", content=bot_reply),
        ])
        db.session.commit()

        if session_obj.title == "New Chat":
            try:
                title_prompt = f"Generate a short, 3-5 word medical summary title for this query: {user_input}"
                title_response = model.invoke(title_prompt)
                title_text = title_response.content.strip().replace('"', '')
                session_obj.title = title_text[:50] if title_text else "Medical Chat"
                db.session.commit()
            except Exception as e:
                print("Title generation failed:", e)


        return jsonify({"reply": bot_reply})

    except Exception as e:
        print("Error:", e)
        return jsonify({"error": str(e)}), 500


# -------------------------------------------------
# Run app
# -------------------------------------------------
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=8080, debug=True, use_reloader=False)

