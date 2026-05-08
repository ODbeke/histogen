# { "Depends": "py-genlayer:test" }
import json
from genlayer import *

class HistoricalClaimValidator(gl.Contract):
    next_claim_id: u32
    claims: TreeMap[u32, str]
    claim_verdicts: TreeMap[u32, bool]
    claim_reasonings: TreeMap[u32, str]

    def __init__(self):
        self.next_claim_id = u32(1)

    @gl.public.write
    def submit_claim(self, claim_text: str) -> u32:
        claim_id = self.next_claim_id
        self.claims[claim_id] = claim_text
        self.next_claim_id += u32(1)
        return claim_id

    @gl.public.write
    def validate_claim(self, claim_id: u32) -> bool:
        claim_text = self.claims.get(claim_id, "")
        
        if not claim_text:
            return False

        def verify_claim_nondet() -> str:
            prompt = f"""
            You are a strict historical fact-checker. Analyze the claim using your internal knowledge.
            
            Claim: "{claim_text}"
            
            Task: Determine if the claim is historically accurate.
            Output a JSON object with two keys:
            - "verdict": true if correct, false if incorrect or unsupported.
            - "reasoning": a very concise 1-sentence explanation.
            """
            
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps({
                "verdict": bool(response.get("verdict", False)),
                "reasoning": str(response.get("reasoning", ""))
            }, sort_keys=True)

        consensus_result_str = gl.eq_principle.strict_eq(verify_claim_nondet)
        
        try:
            result_dict = json.loads(consensus_result_str)
            verdict = result_dict.get("verdict", False)
            reasoning = result_dict.get("reasoning", "")
        except:
            verdict = False
            reasoning = "Failed to parse consensus result."
            
        self.claim_verdicts[claim_id] = verdict
        self.claim_reasonings[claim_id] = reasoning
        return verdict

    @gl.public.view
    def get_claim_status(self, claim_id: u32) -> bool:
        return self.claim_verdicts.get(claim_id, False)

    @gl.public.view
    def get_claim_reasoning(self, claim_id: u32) -> str:
        return self.claim_reasonings.get(claim_id, "")
