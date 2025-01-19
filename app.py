import os
import time
from typing import Optional

from ollama import chat
from ollama import ChatResponse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from llm.llama import ask_question
from dotenv import load_dotenv

from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

allowed_origins = ["*"]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

user_states = {}

class ChatRequest(BaseModel):
    user_id: str
    text: str
    history: str

class ChatResponse(BaseModel):
    response: str

def clear_user_states():
    user_states = {}

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    user_id = req.user_id
    user_text = req.text.strip() if req.text else ""

    state = user_states.get(user_id)
    if not state:
        state = {
            "last_timestamp": time.time(),
            "history": []
        }
        user_states[user_id] = state

    current_time = time.time()
    elapsed = current_time - state["last_timestamp"]

    if elapsed > 5:
        if state["history"]:
            summary_prompt = "Summarize the user's questions so far:\n"
            for idx, question in enumerate(state["history"], start=1):
                summary_prompt += f"{idx}. {question}\n"
            summary_answer = ask_question(summary_prompt)
            print(f"[DEBUG] Summary for user {user_id}: {summary_answer}")
            clear_user_states()
    else:
        state["last_timestamp"] = current_time
        state["history"].append(user_text)
        llm_response = ask_question(user_text)
        return ChatResponse(response=llm_response)

if __name__ == '__main__':
    print(ask_question("hello, what's your name"))