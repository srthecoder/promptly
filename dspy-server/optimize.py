"""
Run ONCE to compile with MIPROv2 + Claude teacher.

MIPROv2 chosen because it optimizes BOTH prompt
instructions AND few-shot examples simultaneously.
BootstrapFewShot only optimizes examples.

Teacher model passed via teacher_settings=dict(lm=...)
per official DSPy cheatsheet pattern.
"""

import os
import dspy
from dspy.teleprompt import MIPROv2
from pipeline import PromptlyPipeline, restructure_reward


TRAINSET = [
    dspy.Example(
        raw_prompt=(
            "Hey so I was doing some reading and I came "
            "across this topic and I was really curious. "
            "Could you maybe explain the difference "
            "between supervised and unsupervised "
            "machine learning? Thanks so much!"
        ),
        output={
            "structured": (
                "Task: explain supervised vs "
                "unsupervised ML | "
                "Focus: practical difference | "
                "Format: 2 sentences"
            ),
            "format_used": "pipe",
            "explanation": (
                "Removed filler, distilled to pipe."
            )
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "Please write in a professional but "
            "friendly tone. Avoid jargon. Keep it "
            "short. Provide examples. "
            "Explain compound interest."
        ),
        output={
            "structured": (
                "## Task\n"
                "Explain compound interest\n\n"
                "## Style\n"
                "[Style:Professional-Friendly] "
                "[Style:NoJargon] "
                "[Style:Concise] "
                "[Include:Examples]\n\n"
                "## Output\n"
                "One paragraph, one numerical example"
            ),
            "format_used": "markdown",
            "explanation": (
                "Tokenized style instructions, "
                "structured in markdown."
            )
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "I need a competitive analysis starting "
            "with market overview, then competitor "
            "breakdown with pricing and features, "
            "then SWOT, then three strategic "
            "recommendations."
        ),
        output={
            "structured": (
                "<task>Competitive analysis</task>\n"
                "<output>\n"
                "  <section>Market overview: "
                "trends+size, 2 para</section>\n"
                "  <section>Competitor table: "
                "pricing+features</section>\n"
                "  <section>SWOT bullets</section>\n"
                "  <section>3 strategic "
                "recommendations</section>\n"
                "</output>"
            ),
            "format_used": "xml",
            "explanation": "Multi-section → XML template."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "help with my react component its "
            "broken and not rendering correctly"
        ),
        output={
            "structured": (
                "Task: debug React component | "
                "Problem: not rendering | "
                "Output: root cause + fixed code"
            ),
            "format_used": "pipe",
            "explanation": "Added output specification."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "I have a list of dicts in Python with "
            "name and age keys sort by age descending "
            "and handle missing age values"
        ),
        output={
            "structured": (
                "Task: sort list[dict] by age desc | "
                "Handle: missing/null age, sort last | "
                "Language: Python | "
                "Output: code only, inline comments"
            ),
            "format_used": "pipe",
            "explanation": "Compressed, added edge case."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "write a comprehensive research summary "
            "about neural networks history including "
            "major milestones and key researchers "
            "be thorough"
        ),
        output={
            "structured": (
                "## Task\n"
                "Research summary: neural networks history\n\n"
                "## Coverage\n"
                "[Depth:Thorough]\n"
                "- Major milestones chronological\n"
                "- Key researchers per milestone\n\n"
                "## Output\n"
                "Sections by era, citations where possible"
            ),
            "format_used": "markdown",
            "explanation": "Tokenized depth, structured markdown."
        }
    ).with_inputs("raw_prompt"),

    dspy.Example(
        raw_prompt=(
            "explain docker to someone with no "
            "technical background at all"
        ),
        output={
            "structured": (
                "Task: explain Docker | "
                "[Audience:NonTechnical] | "
                "Output: 2 sentences, everyday analogy"
            ),
            "format_used": "pipe",
            "explanation": "Tokenized audience, pipe format."
        }
    ).with_inputs("raw_prompt"),
]


def compile_pipeline():
    groq_key = os.environ["GROQ_API_KEY"]

    student_lm = dspy.LM(
        model="groq/llama-3.3-70b-versatile",
        api_key=groq_key,
        temperature=0.1
    )
    dspy.configure(lm=student_lm)

    teacher_lm = dspy.LM(
        model="groq/llama-3.3-70b-versatile",
        api_key=groq_key,
        temperature=0.1
    )

    print("Compiling with MIPROv2...")
    print(f"Student: groq/llama-3.3-70b-versatile")
    print(f"Teacher: groq/llama-3.3-70b-versatile")
    print(f"Examples: {len(TRAINSET)}")

    teleprompter = MIPROv2(
        metric=restructure_reward,
        auto="light",
        num_threads=1,
    )

    pipeline = PromptlyPipeline()

    compiled = teleprompter.compile(
        pipeline.deepcopy(),
        trainset=TRAINSET,
        max_bootstrapped_demos=2,
        max_labeled_demos=2,
    )

    os.makedirs("compiled", exist_ok=True)
    compiled.save("compiled/promptly.json")
    print("Saved: compiled/promptly.json")
    print("Run: uvicorn server:app --port 8000")


if __name__ == "__main__":
    compile_pipeline()
