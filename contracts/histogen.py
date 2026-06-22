# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

def _parse_llm_json(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        s = str(raw).strip().replace("```json", "").replace("```", "").strip()
        start, end = s.find("{"), s.rfind("}") + 1
        if start >= 0 and end > start:
            s = s[start:end]
        return json.loads(s)
    except Exception:
        return {}

class HistoricalClaimValidator(gl.Contract):
    next_claim_id: u32
    claims: TreeMap[u32, str]
    claim_verdicts: TreeMap[u32, bool]
    claim_reasonings: TreeMap[u32, str]

    def __init__(self):
        self.next_claim_id = u32(1)

    @gl.public.write
    def submit_and_validate_claim(self, claim_text: str, source_url: str = "") -> u32:
        """
        Submits and evaluates a historical claim onchain.
        Can optionally fetch reference context from a source_url.
        """
        claim_id = self.next_claim_id
        self.claims[claim_id] = claim_text
        self.next_claim_id += u32(1)
        
        if not claim_text:
            return claim_id

        def leader_fn() -> str:
            # Check if we have a source URL to fetch context
            context = ""
            if source_url and source_url.strip():
                try:
                    context = gl.nondet.web.render(source_url.strip(), mode="text")
                    context = f"\n\nReference Source Content from {source_url}:\n{context[:4000]}\n"
                except Exception as e:
                    context = f"\n\n(Note: Failed to fetch source URL: {str(e)})\n"

            prompt = f"""
            You are a strict historical fact-checker. Analyze the claim using your internal knowledge and the provided reference source content if present.
            
            Claim: "{claim_text}"
            {context}
            Task: Determine if the claim is historically accurate.
            Output a JSON object with exactly two keys:
            - "verdict": a strict boolean: true if correct, false if incorrect or unsupported.
            - "reasoning": a brief 1-sentence explanation of why it is correct or incorrect.
            """
            
            try:
                response = gl.nondet.exec_prompt(prompt, response_format="json")
                parsed = _parse_llm_json(response)
                verdict = bool(parsed.get("verdict", False))
                reasoning = str(parsed.get("reasoning", ""))
            except Exception as e:
                verdict = False
                reasoning = f"Validation encountered an error: {str(e)}"
                
            return json.dumps({"verdict": verdict, "reasoning": reasoning})

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            
            leader_str = leader_result.calldata
            if not isinstance(leader_str, str):
                return False
            
            try:
                leader_data = json.loads(leader_str)
            except Exception:
                return False
                
            if "verdict" not in leader_data or "reasoning" not in leader_data:
                return False
            
            # Independent verification of the verdict
            try:
                own_data = json.loads(leader_fn())
            except Exception:
                return False
                
            return own_data.get("verdict") == leader_data.get("verdict")

        # Run non-deterministic consensus using custom validation
        raw_consensus = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        
        try:
            consensus_data = json.loads(raw_consensus)
            verdict = bool(consensus_data.get("verdict", False))
            reasoning = str(consensus_data.get("reasoning", "Consensus completed successfully."))
        except Exception:
            verdict = False
            reasoning = "Failed to parse consensus results."

        self.claim_verdicts[claim_id] = verdict
        self.claim_reasonings[claim_id] = reasoning
        return claim_id

    @gl.public.view
    def get_claim_count(self) -> int:
        return int(self.next_claim_id) - 1

    @gl.public.view
    def get_claim_status(self, claim_id: u32) -> bool:
        return self.claim_verdicts.get(claim_id, False)

    @gl.public.view
    def get_claim_reasoning(self, claim_id: u32) -> str:
        return self.claim_reasonings.get(claim_id, "")
