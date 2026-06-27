import dspy
from pydantic import BaseModel, Field


class OptimizedPromptOutput(BaseModel):
    structured: str = Field(
        description=(
            "Restructured prompt in pipe, markdown, "
            "or xml format. NEVER JSON. "
            "Do not answer the question. "
            "Output rewritten prompt only."
        )
    )
    format_used: str = Field(
        description="Exactly one of: pipe | markdown | xml"
    )
    explanation: str = Field(
        description=(
            "One sentence on what changed. "
            "e.g. 'Removed filler, applied XML "
            "template abstraction.'"
        )
    )


class RestructureSignature(dspy.Signature):
    """
    You are a prompt structure optimizer.

    A user has written a draft prompt they intend
    to send to a language model. Your job is to
    rewrite it into the most token-efficient
    structured format, preserving 100% of intent.

    WHAT TO DO:
    1. Remove conversational filler:
       "hey so", "i was wondering", "thanks so much",
       "i hope you don't mind", "could you maybe",
       "if that makes sense", "sorry to bother you"

    2. Detect and tokenize style instructions:
       "write in a friendly tone" → [Style:Friendly]
       "avoid jargon"            → [Style:NoJargon]
       "be concise"              → [Style:Concise]
       "use bullet points"       → [Format:Bullets]
       "step by step"            → [Format:Steps]
       "provide examples"        → [Include:Examples]
       "be thorough"             → [Depth:Thorough]
       "professional tone"       → [Style:Professional]
       "non-technical audience"  → [Audience:NonTechnical]

    3. Choose format by complexity:
       pipe     → simple, single question, under 25 words
       markdown → medium complexity, 25-100 words
       xml      → complex, multi-section, over 100 words

    4. Restructure into chosen format:

    pipe format:
    Task: sort list by age desc |
    Handle: null ages |
    Output: code only, inline comments

    markdown format:
    ## Task
    Explain compound interest
    ## Style
    [Style:Simple] [Include:Examples]
    ## Output
    One paragraph, one numerical example

    xml format:
    <task>Competitive analysis</task>
    <output>
      <section>Market overview: 2 para</section>
      <section>Competitor table</section>
      <section>SWOT bullets</section>
      <section>3 recommendations</section>
    </output>

    NEVER:
    - Answer the question being asked
    - Generate the requested content
    - Use JSON format (too many tokens)
    - Add preamble like "Here is your prompt:"
    - Change the core intent
    """
    raw_prompt: str = dspy.InputField(
        desc="User's raw unmodified draft prompt."
    )
    output: OptimizedPromptOutput = dspy.OutputField()


def restructure_reward(args, pred) -> float:
    """
    Reward function for dspy.Refine and MIPROv2 metric.
    Returns 0.0 to 1.0. Four criteria, equally weighted.
    """
    try:
        structured = pred.output.structured
    except Exception:
        return 0.0

    not_json = not structured.strip().startswith("{")
    raw = (
        args.get("raw_prompt", "")
        if isinstance(args, dict)
        else getattr(args, "raw_prompt", "")
    )
    saves_tokens = (
        len(structured.split()) < len(raw.split())
    )
    has_structure = any(
        m in structured for m in [
            "##", "<task>", " | ", "[Style",
            "[Format", "[Include", "[Depth", "[Audience"
        ]
    )
    not_answering = not any(
        p in structured.lower()[:60] for p in [
            "here is", "sure!", "certainly",
            "i can help", "of course", "absolutely",
            "the answer is"
        ]
    )
    return (
        not_json + saves_tokens +
        has_structure + not_answering
    ) / 4.0


class PromptlyPipeline(dspy.Module):
    def __init__(self):
        super().__init__()
        # dspy.Refine: runs up to 3 times,
        # returns best result above threshold.
        # Replaces deprecated dspy.Assert.
        self.restructurer = dspy.Refine(
            module=dspy.Predict(RestructureSignature),
            N=3,
            reward_fn=restructure_reward,
            threshold=0.75
        )

    def forward(self, raw_prompt: str) -> dict:
        with dspy.context(track_usage=True):
            prediction = self.restructurer(
                raw_prompt=raw_prompt
            )
            usage = prediction.get_lm_usage()

        return {
            "structured":  prediction.output.structured,
            "format_used": prediction.output.format_used,
            "explanation": prediction.output.explanation,
            "lm_usage":    usage,
        }
