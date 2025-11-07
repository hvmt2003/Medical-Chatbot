DocTalk - Your AI-Powered Medical Assistant
​DocTalk is a modern, responsive web application built with Flask that functions as an AI-powered medical chat assistant. It leverages Google's Gemini models for conversational intelligence, LangChain for seamless RAG (Retrieval-Augmented Generation), and Pinecone for a specialized knowledge base, ensuring grounded and relevant responses to medical queries.
​The application includes full user authentication and stores persistent chat history using SQLAlchemy and SQLite.
​Features
​Responsive Chat UI: Fully adaptive design (Desktop, Tablet, Mobile) to ensure a great user experience on any device.
​User Authentication: Secure user sign-up, login, and logout powered by Flask-Login and Flask-Bcrypt.
​Persistent History: Stores individual user chat sessions and messages using SQLAlchemy/SQLite.
​Retrieval-Augmented Generation (RAG): Answers are grounded in external medical knowledge stored in a Pinecone vector database, minimizing hallucinations and increasing accuracy.
​Gemini Integration: Utilizes the gemini-2.5-flash model via LangChain for fast, professional, and knowledgeable responses.
​Deployment Ready: Configured for seamless deployment on platforms like Google Cloud Run, with conditional session settings for both HTTP and HTTPS environments.
