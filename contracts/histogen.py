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
    def submit_and_validate_claim(self, claim_text: str) -> u32:
        """
        Submits and evaluates a historical claim in a single transaction.
        Returns the unique ID for the claim.
        """
        claim_id = self.next_claim_id
        self.claims[claim_id] = claim_text
        self.next_claim_id += u32(1)
        
        if not claim_text:
            return claim_id

        def verify_claim_nondet() -> bool:
            prompt = f"""
            You are a strict historical fact-checker. Analyze the claim using your internal knowledge.
            
            Claim: "{claim_text}"
            
            Task: Determine if the claim is historically accurate.
            Output a JSON object with exactly one key: "verdict".
            The value must be a strict boolean: true if correct, false if incorrect or unsupported.
            """
            
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            return bool(response.get("verdict", False))

        # We strictly enforce consensus only on the boolean verdict
        consensus_verdict = gl.eq_principle.strict_eq(verify_claim_nondet)
        
        # Set deterministic reasoning based on the robust consensus outcome
        reasoning = "GenLayer Intelligent Contract consensus reached: The claim is historically accurate." if consensus_verdict else "GenLayer Intelligent Contract consensus reached: The claim contradicts historical records or lacks evidence."
            
        self.claim_verdicts[claim_id] = consensus_verdict
        self.claim_reasonings[claim_id] = reasoning
        return claim_id

    @gl.public.view
    def get_claim_count(self) -> u32:
        return self.next_claim_id - u32(1)

    @gl.public.view
    def get_claim_status(self, claim_id: u32) -> bool:
        return self.claim_verdicts.get(claim_id, False)

    @gl.public.view
    def get_claim_reasoning(self, claim_id: u32) -> str:
        return self.claim_reasonings.get(claim_id, "")
