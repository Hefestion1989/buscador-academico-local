from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
CHROMA_DIR = DATA_DIR / "chroma"
METADATA_DIR = DATA_DIR / "metadata"
FILES_METADATA_PATH = METADATA_DIR / "files.json"

COLLECTION_NAME = "academic_materials"
EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".rtf"}

CHUNK_SIZE = 1100
CHUNK_OVERLAP = 220
DEFAULT_TOP_K = 8
DEFAULT_MIN_RELEVANCE = 0.32
DEFAULT_CANDIDATE_MULTIPLIER = 6
DEFAULT_MAX_RESULTS_PER_FILE = 3

IGNORED_DIR_NAMES = {
    ".git",
    "__pycache__",
    ".venv",
    "node_modules",
    "$RECYCLE.BIN",
    "System Volume Information",
}
