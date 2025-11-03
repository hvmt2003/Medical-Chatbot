import streamlit as st
from dotenv import load_dotenv
import os
from src.helper import download_embeddings
from langchain_community.vectorstores import Pinecone as PineconeVectorStore
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from src.prompt import *

# ------------------------------
# Load environment variables
# ------------------------------
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

os.environ["PINECONE_API_KEY"] = PINECONE_API_KEY
os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY

# ------------------------------
# Initialize embeddings and retriever
# ------------------------------
embeddings = download_embeddings()
index_name = "medical-chatbot"

docsearch = PineconeVectorStore.from_existing_index(
    index_name=index_name,
    embedding=embeddings
)
retriever = docsearch.as_retriever(search_type="similarity", search_kwargs={"k": 3})

# ------------------------------
# Initialize Gemini model + prompt
# ------------------------------
model = ChatGoogleGenerativeAI(model="models/gemini-2.5-flash", temperature=0.2)

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}")
])

question_answer_chain = create_stuff_documents_chain(model, prompt)
rag_chain = create_retrieval_chain(retriever, question_answer_chain)

# ------------------------------
# Streamlit App UI
# ------------------------------
st.set_page_config(page_title="🩺 Medical Chatbot", layout="wide")
st.title("🩺 AI-Powered Medical Assistant")

st.write("This chatbot uses Gemini and Pinecone to provide medical information from your uploaded PDFs.")

# Session state for chat history
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

# Input from user
user_input = st.chat_input("Ask your medical question...")

if user_input:
    with st.spinner("Analyzing..."):
        response = rag_chain.invoke({"input": user_input})
        answer = response["answer"]

        # Save in history
        st.session_state.chat_history.append(("You", user_input))
        st.session_state.chat_history.append(("Bot", answer))

# Display chat history
for role, text in st.session_state.chat_history:
    if role == "You":
        st.chat_message("user").markdown(text)
    else:
        st.chat_message("assistant").markdown(text)
