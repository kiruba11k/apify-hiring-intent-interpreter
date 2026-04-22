# Hiring Intent Interpreter (Apify Actor)

This Actor analyzes job postings and converts them into structured B2B technology buying-intent signals.

It is designed for use on Apify, where you provide job data as Actor input and receive normalized intent records in the default dataset.

## What this Actor does

For each job posting, the Actor:

1. Validates required fields (`job_title`, `job_description`, `company_name`).
2. Sends the posting to a Groq-hosted LLM with a strict extraction prompt.
3. Parses and validates the model response into a stable JSON schema.
4. Applies deterministic scoring boosts (seniority, urgency, repeated hiring, team build signals, etc.).
5. Stores one output object per job in the dataset.
6. Stores a `SUMMARY` key-value record with aggregate metrics.

## Input

You can pass either:

- A batch object with `jobs` array (recommended), or
- A single job object.

### Recommended input format

```json
{
  "jobs": [
    {
      "job_title": "Data Science Meets Sales & Marketing (GTM Engineering) - Internship",
      "company_name": "LeadStrategus",
      "job_description": "...full job description text...",
      "historical_job_count": 1,
      "location_country": "India",
      "location_city": "Bangalore"
    }
  ]
}
```

### Field reference

- `job_title` (string, required)
- `company_name` (string, required)
- `job_description` (string, required, minimum ~30 chars)
- `historical_job_count` (number, optional, default: `1`)
- `location_country` (string, optional)
- `location_city` (string, optional)

## Output schema

Each dataset item follows this structure:

```json
{
  "company_name": "string",
  "job_title": "string",
  "location_country": "string|null",
  "location_city": "string|null",
  "intent_domain": "AI|ERP|Cloud|Data|Security|QA|None",
  "intent_subtype": "string",
  "intent_type": "Implementation|Migration|Optimization|Expansion|None",
  "intent_score": 0,
  "intent_strength": "High|Medium|Low",
  "tech_stack_structured": ["string"],
  "primary_tools": ["string"],
  "role_criticality": "Core|Supporting|Peripheral",
  "reasoning": "string",
  "signals": ["string"],
  "historical_job_count": 1,
  "interpreted_at": "ISO-8601 datetime"
}
```

## Example output

Using the sample you provided, one interpreted record looks like:

```json
{
  "company_name": "LeadStrategus",
  "job_title": "Data Science Meets Sales & Marketing (GTM Engineering) - Internship",
  "location_country": "India",
  "location_city": "Bangalore",
  "intent_domain": "AI",
  "intent_subtype": "NLP",
  "intent_type": "Implementation",
  "intent_score": 78,
  "intent_strength": "High",
  "tech_stack_structured": [
    "Python",
    "Pandas",
    "Scikit-learn",
    "spaCy",
    "Hugging Face",
    "TensorFlow",
    "PyTorch",
    "JavaScript",
    "Node.js",
    "AWS",
    "GCP",
    "Docker",
    "SQL",
    "NoSQL"
  ],
  "primary_tools": [
    "Python",
    "spaCy",
    "TensorFlow"
  ],
  "role_criticality": "Core",
  "reasoning": "The job posting requires the selected intern to analyze data using Python libraries, experiment with AI/ML and NLP techniques, and deploy workflows on AWS/GCP. The use of specific libraries such as spaCy, Hugging Face, and TensorFlow indicates a strong focus on NLP. The requirement to work with machine learning frameworks and apply NLP techniques using Hugging Face models also suggests a core role in AI implementation.",
  "signals": [
    "Analyze data using Python libraries",
    "Experiment with AI/ML and NLP techniques",
    "Deploy workflows on AWS/GCP",
    "Work with machine learning frameworks like TensorFlow or PyTorch",
    "Apply NLP techniques using Hugging Face models"
  ],
  "historical_job_count": 1,
  "interpreted_at": "2026-04-22T10:20:45.619Z"
}
```

## Apify setup

Set this as an Actor secret/environment variable:

- `GROQ_API_KEY` (required)

Optional:

- `GROQ_MODEL` (default: `llama-3.3-70b-versatile`)
- `LOG_LEVEL=DEBUG` (to enable debug logging)

## How to run locally

```bash
npm install
npm start
```

For local runs, you can pass input through Apify local input conventions (for example, `INPUT.json` when using Apify tooling).

## Apify run behavior

- Invalid job records are skipped and written to dataset with `skipped: true` and validation error details.
- Per-job model failures are captured and written to dataset with `failed: true`.
- A small delay is used between jobs to reduce API pressure.
- A summary object is saved to key-value store under `SUMMARY` with:
  - total processed
  - high/medium/low intent counts
  - top intent domains
  - top intent subtypes
  - role criticality breakdown
  - UK job count
  - average intent score

## Notes

- Output quality depends heavily on job description quality and specificity.
- `intent_domain` is intentionally single-label for simpler downstream filtering.
- Scoring is capped at `95` by design.
