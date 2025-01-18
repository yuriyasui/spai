import transformers
import torch

model_id = "meta-llama/Llama-3.1-8B"

pipeline = transformers.pipeline(
    "text-generation", model=model_id, model_kwargs={"torch_dtype": torch.bfloat16}, device_map="auto"
)

if __name__ == "__main__":
    pipeline("Hey how are you doing today?")