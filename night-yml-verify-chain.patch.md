# PATCH TO APPLY (GitHub web editor -> .github/workflows/night.yml)
#
# Why this file exists: the PAT used for this repo has scope `repo` but NOT `workflow`,
# so neither git push nor the REST API can write to .github/workflows/*.
# Copy the block below into the "Verify chain" step of night.yml via
# https://github.com/JayJayjj123456789/night-shift/blob/main/.github/workflows/night.yml
# (click the pencil icon), then commit that file directly on the branch.
#
# --- BEGIN night.yml patch ---
      - name: Verify chain
        working-directory: orchestrator
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_API_KEY }}
          UNIVERSE_ID: ${{ secrets.UNIVERSE_ID }}
          LLM_BASE: ${{ secrets.LLM_BASE }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: ${{ secrets.LLM_MODEL }}
        run: |
          export NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d)
          node dist/status.js

# --- END night.yml patch ---
#
# Insert it directly above the existing "- name: Commit log + previews" step.
