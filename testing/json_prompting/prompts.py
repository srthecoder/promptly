"""
Test prompt pairs: raw prose → structured JSON.
Each entry is a dict with:
  name        — short label for the experiment row
  category    — type of task
  raw         — original natural-language prompt
  structured  — compact JSON/key-value equivalent
"""

TEST_CASES = [
    {
        "name": "Product Comparison",
        "category": "comparison",
        "raw": (
            "Please provide a detailed comparison between the MacBook Pro M3 and the Dell XPS 15, "
            "focusing on their price points, performance benchmarks, battery life, display quality, "
            "and what type of user each one is best suited for. I'd like you to be thorough and "
            "cover all the major differences so I can make an informed purchasing decision."
        ),
        "structured": (
            '{"task":"compare","items":["MacBook Pro M3","Dell XPS 15"],'
            '"criteria":["price","performance","battery_life","display","best_for"],'
            '"format":"table+summary","length":"concise"}'
        ),
    },
    {
        "name": "Text Summarization",
        "category": "summarization",
        "raw": (
            "Can you please read the following passage and give me a comprehensive summary that "
            "captures all the important points, key arguments, and main takeaways? I want the "
            "summary to be detailed enough that someone who hasn't read the original text would "
            "fully understand the content without missing anything important. Please make sure "
            "to preserve the original meaning and don't leave out any critical information.\n\n"
            "The transformer architecture, introduced in the paper 'Attention Is All You Need' by "
            "Vaswani et al. in 2017, revolutionized natural language processing by replacing "
            "recurrent layers with self-attention mechanisms. Unlike RNNs which process tokens "
            "sequentially, transformers process all tokens simultaneously, enabling massive "
            "parallelization during training. The key innovation is the multi-head attention "
            "mechanism, which allows the model to jointly attend to information from different "
            "representation subspaces at different positions."
        ),
        "structured": (
            '{"task":"summarize","style":"bullet_points","max_bullets":5,'
            '"preserve":["key_arguments","main_takeaways"],'
            '"input":"Transformer architecture (Vaswani 2017): replaced RNNs with self-attention, '
            'enables parallel token processing, multi-head attention attends multiple subspaces simultaneously."}'
        ),
    },
    {
        "name": "Information Extraction",
        "category": "extraction",
        "raw": (
            "I have a block of text and I need you to go through it carefully and extract all "
            "the relevant contact information you can find, including names, email addresses, "
            "phone numbers, company names, job titles, and physical addresses. Please organize "
            "this information in a way that's easy to read and understand.\n\n"
            "Hi, my name is Sarah Chen and I work as a Senior Product Manager at TechFlow Inc. "
            "You can reach me at sarah.chen@techflow.io or call my direct line at (415) 555-0192. "
            "Our headquarters is located at 742 Market Street, Suite 300, San Francisco, CA 94103. "
            "My colleague James Rivera (jrivera@techflow.io) handles enterprise accounts."
        ),
        "structured": (
            '{"task":"extract","fields":["name","title","company","email","phone","address"],'
            '"output_format":"json_array",'
            '"input":"Sarah Chen, Senior PM, TechFlow Inc, sarah.chen@techflow.io, (415)555-0192, '
            '742 Market St Suite 300 SF CA 94103. Colleague: James Rivera jrivera@techflow.io enterprise accounts."}'
        ),
    },
    {
        "name": "Code Generation",
        "category": "code",
        "raw": (
            "I need you to write me a Python function that connects to a PostgreSQL database "
            "and retrieves records from a users table. The function should accept filtering "
            "parameters so I can search by different fields, and it should also support "
            "pagination so I don't retrieve too many records at once. Please make sure to "
            "handle errors properly and close the database connection when done. Add comments "
            "to explain what the code is doing."
        ),
        "structured": (
            '{"task":"generate_code","lang":"python","fn":"get_users",'
            '"db":"postgresql","table":"users",'
            '"features":["filter_by_fields","pagination","error_handling","connection_cleanup"],'
            '"output":"code_only","comments":false}'
        ),
    },
    {
        "name": "Data Analysis Plan",
        "category": "analysis",
        "raw": (
            "I'm working with a dataset that contains customer transaction data from an e-commerce "
            "platform spanning the last two years. I want to understand which customer segments are "
            "most profitable, what the seasonal purchasing patterns look like, which products have "
            "the highest return rates, and whether there's any correlation between customer age "
            "and average order value. Can you help me think through the best analytical approach "
            "and suggest which statistical methods or visualizations I should use for each question?"
        ),
        "structured": (
            '{"task":"analysis_plan","dataset":"e-commerce transactions, 2yr",'
            '"questions":['
            '{"q":"most_profitable_segments","methods":["RFM","cohort"]},'
            '{"q":"seasonal_patterns","methods":["time_series","decomposition"]},'
            '{"q":"high_return_products","methods":["frequency_table","pareto"]},'
            '{"q":"age_vs_order_value","methods":["correlation","scatter_regression"]}'
            '],"output":"method+viz_per_question"}'
        ),
    },
    {
        "name": "Research Question",
        "category": "research",
        "raw": (
            "I'm trying to understand the potential long-term economic effects of widespread "
            "artificial intelligence adoption across different industries. I'm particularly "
            "interested in how this might affect employment levels, wage inequality, productivity "
            "growth, and what policy interventions economists are currently recommending to "
            "address any negative effects. Please give me a comprehensive overview based on "
            "current economic research and thinking on this topic."
        ),
        "structured": (
            '{"task":"research_overview","topic":"economic effects of AI adoption",'
            '"scope":["employment","wage_inequality","productivity_growth","policy_interventions"],'
            '"basis":"current_economic_research","length":"concise","format":"section_per_scope_item"}'
        ),
    },
    {
        "name": "Email Draft",
        "category": "writing",
        "raw": (
            "I need to write an email to my team letting them know that the project deadline "
            "has been pushed back by two weeks because the client requested additional features "
            "at the last minute. I want the tone to be professional but also reassuring, and "
            "I'd like to acknowledge that this might cause some inconvenience for people who "
            "had already planned their schedules around the original deadline. Please also "
            "include a note about a team sync meeting I want to schedule for next Monday."
        ),
        "structured": (
            '{"task":"draft_email","to":"team","tone":"professional+reassuring",'
            '"points":['
            '"deadline pushed 2wks: client added features last-minute",'
            '"acknowledge scheduling inconvenience",'
            '"team sync: next Monday"'
            '],"length":"brief"}'
        ),
    },
]
