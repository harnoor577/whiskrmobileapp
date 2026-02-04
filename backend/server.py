from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Analyze Recording Models
class PatientInfo(BaseModel):
    patientId: Optional[str] = None
    name: Optional[str] = None
    species: Optional[str] = None

class PreviousMessage(BaseModel):
    role: str
    content: str

class AnalyzeRecordingRequest(BaseModel):
    transcription: Optional[str] = None
    patientInfo: Optional[PatientInfo] = None
    consultId: Optional[str] = None
    followUpQuestion: Optional[str] = None
    previousMessages: Optional[List[PreviousMessage]] = None

class AnalyzeRecordingResponse(BaseModel):
    analysis: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Atlas AI System Prompt
ATLAS_SYSTEM_PROMPT = """You are Atlas, an AI veterinary assistant. Your role is to analyze case recordings and provide clinical insights.

Your style:
- Professional and clinical
- Use clear, precise medical language
- Stick strictly to case-relevant information only
- Do NOT include greetings, encouraging notes, or sign-offs
- Do NOT ask follow-up questions at the end of responses
- Never include salutations or closing remarks
- Output only clinical information relevant to the case

IMPORTANT FORMATTING RULES:
- Do NOT use markdown formatting (no **, *, #, ##, ### symbols)
- Do NOT use asterisks or underscores for emphasis
- Use numbered lists (1. 2. 3.) for sequential items
- Use plain bullet points (•) for lists, not dashes or asterisks
- Use plain text with clear section headers followed by colons
- Use line breaks to separate sections
- Keep formatting simple and clean

When analyzing a case initially (no specific request):

Case Summary:
Provide a clear, concise summary of the key findings from the recording. Include:
• Patient presentation and chief complaint
• Relevant history mentioned
• Physical examination findings noted
• Any vitals or measurements mentioned
• Owner concerns or constraints

Keep it informative but brief. Do NOT include differential diagnoses, recommended diagnostics, treatment plans, or procedures in this initial summary.

When asked for Differential Diagnoses:
Provide 3-5 differential diagnoses ranked by likelihood. For each diagnosis:
• The diagnosis name
• A brief explanation of why it fits this case

When asked about a specific differential's reasoning and treatment:
Provide:
• REASON: Why this diagnosis is being considered
• TREATMENT PLAN: Recommended diagnostics, medications, and monitoring

When asked for Treatment Plan:
Provide a comprehensive treatment plan including:
1. Medications (drug name, dose, route, frequency, duration)
2. Diet & Nutrition recommendations
3. Activity Restrictions
4. Home Care Instructions
5. Follow-up Schedule
6. Warning Signs to watch for"""

@api_router.post("/analyze-recording", response_model=AnalyzeRecordingResponse)
async def analyze_recording(request: AnalyzeRecordingRequest):
    """
    Analyze a veterinary case recording using AI.
    """
    try:
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        # Build patient context
        patient_context = ""
        if request.patientInfo:
            patient_context = f"""
Patient Information:
• Patient ID: {request.patientInfo.patientId or 'N/A'}
• Name: {request.patientInfo.name or 'Unknown'}
• Species: {request.patientInfo.species or 'Unknown'}
"""

        # Build system message with patient context
        system_message = ATLAS_SYSTEM_PROMPT + patient_context

        # Create unique session ID for this conversation
        session_id = f"atlas-{request.consultId or uuid.uuid4()}"

        # Initialize the chat
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_message
        ).with_model("gemini", "gemini-2.5-flash")

        # Build the user message
        if not request.followUpQuestion:
            # Initial analysis request
            user_content = f"""Please analyze this veterinary case recording and provide a case summary only:

Recording Transcription:
{request.transcription or 'No transcription available'}

Provide a helpful case summary based on the recording. Do not include differential diagnoses, treatment plans, or procedures - only summarize the key findings."""
        else:
            # Follow-up question with context
            context_snippet = ""
            if request.transcription:
                context_snippet = f"[Context from recording: {request.transcription[:500]}{'...' if len(request.transcription) > 500 else ''}]\n\n"
            
            user_content = f"{context_snippet}{request.followUpQuestion}"

        # Add previous messages for context (simulate conversation history)
        # Note: The library doesn't maintain history automatically, so we include context in the prompt
        if request.previousMessages and len(request.previousMessages) > 0:
            history_context = "\n\nPrevious conversation:\n"
            for msg in request.previousMessages[-4:]:  # Last 4 messages for context
                role_label = "User" if msg.role == "user" else "Atlas"
                history_context += f"{role_label}: {msg.content[:200]}{'...' if len(msg.content) > 200 else ''}\n"
            user_content = history_context + "\n\nCurrent question:\n" + user_content

        # Create and send the message
        user_message = UserMessage(text=user_content)
        
        logger.info(f"[analyze-recording] Sending request for consult: {request.consultId}")
        
        response = await chat.send_message(user_message)
        
        if not response:
            raise HTTPException(status_code=500, detail="No analysis generated")

        logger.info(f"[analyze-recording] Analysis generated successfully for consult: {request.consultId}")

        return AnalyzeRecordingResponse(analysis=response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[analyze-recording] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred processing your request: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
