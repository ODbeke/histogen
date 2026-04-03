# { "Depends": "py-genlayer:test" }
from genlayer import *

class HistoricalClaimValidator(gl.Contract):
    next_claim_id: u32
    claims: TreeMap[u32, str]
    claim_verdicts: TreeMap[u32, bool]

    def __init__(self):
        # Only initialize scalar values here! 
        # GenVM automatically provisions the TreeMaps in the background.
        self.next_claim_id = u32(1)

    @gl.public.write
    def submit_claim(self, claim_text: str) -> u32:
        """
        Allows users to submit a historical claim.
        Returns the unique ID (u32) for the claim.
        """
        claim_id = self.next_claim_id
        self.claims[claim_id] = claim_text
        self.next_claim_id += u32(1)
        return claim_id

    @gl.public.write
    def validate_claim(self, claim_id: u32, source_url: str) -> bool:
        """
        Triggers the validation process using Optimistic Democracy.
        Returns True if the claim is correct, False otherwise.
        """
        claim_text = self.claims.get(claim_id, "")
        
        if not claim_text:
            return False

        def verify_claim_nondet() -> bool:
            web_data = gl.nondet.web.render(source_url, mode="html")
            
            prompt = f"""
            You are a strict historical fact-checker. Analyze the claim against the provided source text.
            
            Claim: "{claim_text}"
            
            Source Text:
            {web_data[:5000]}
            
            Task: Determine if the source text factually supports the historical claim.
            Output a JSON object with exactly one key: "verdict". 
            The value must be a strict boolean: true if the claim is correct according to the text, or false if it is incorrect or unsupported.
            """
            
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            return bool(response.get("verdict", False))

        consensus_verdict = gl.eq_principle.strict_eq(verify_claim_nondet)
        
        self.claim_verdicts[claim_id] = consensus_verdict
        return consensus_verdict

    @gl.public.view
    def get_claim_status(self, claim_id: u32) -> bool:
        """
        Deterministic, read-only method to fetch the final validated boolean outcome.
        """
        return self.claim_verdicts.get(claim_id, False)
