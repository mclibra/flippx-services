## Roulette Payout Reference (Stake $1)

This summary is based on the payout logic implemented in `src/api/roulette_ticket/controller.js`, which determines winnings for every bet block after a spin settles. The display-friendly labels below map directly to the backend bet keys (e.g. `2 to 1 1st Row` corresponds to `2_to_1_1`). All multipliers are *return-to-player* amounts (i.e. they include the original $1 stake when the bet wins).

- **Single Number (`0` to `36`)**  
  - Multiplier: ×36  
  - Returned Amount: $36  
  - Net Profit: $35

- **Column Bets (`2 to 1 1st Row`, `2 to 1 2nd Row`, `2 to 1 3rd Row`)**  
  - Numbers: each covers 12 numbers in a vertical column  
  - Multiplier: ×3  
  - Returned Amount: $3  
  - Net Profit: $2

- **Dozen Bets (`1st 12`, `2nd 12`, `3rd 12`)**  
  - Numbers: 1–12, 13–24, 25–36 respectively  
  - Multiplier: ×3  
  - Returned Amount: $3  
  - Net Profit: $2

- **Even-Money Outside Bets**  
  - `Low (1–18)`, `High (19–36)`, `Even`, `Odd`, `Red`, `Black`  
  - Multiplier: ×2  
  - Returned Amount: $2  
  - Net Profit: $1  
  - Note: These lose when the winning number is `0`.

- **Named Split, Street, Corner, Line Bets**  
  - `Split 3-6`, `Split 6-9`: explicit split pairs → ×18 (covers 2 numbers)  
  - `Corner 3-6-2-5`, `Corner 6-9-5-8`: explicit corner bets → ×9 (covers 4 numbers)  
  - `Line 4-5-6-7-8-9`: explicit line bet → ×6 (covers 6 numbers)

- **Any Custom Multi-Number Bet (underscore-separated keys)**  
  - The multiplier depends on how many numbers are covered:  
    - 2 numbers → ×18 (split)  
    - 3 numbers → ×12 (street)  
    - 4 numbers → ×9 (corner)  
    - 5 numbers → ×7 (five-number bet)  
    - 6 numbers → ×6 (line)  
  - Example notation: `Street 17-18-19` (key `17_18_19`) returns $12 on $1 when any covered number hits.

### Worked Examples (Winning Number: 18)

Assume the player staked $1 on each of the following bet blocks:

| Bet Block             | Covers Winning Number? | Returned Amount | Net Result |
|-----------------------|------------------------|-----------------|------------|
| `Straight 18`         | Yes                    | $36             | +$35       |
| `Straight 17`         | No                     | $0              | −$1        |
| `Even`                | Yes (18 is even)       | $2              | +$1        |
| `Odd`                 | No                     | $0              | −$1        |
| `Red`                 | Yes (18 is red)        | $2              | +$1        |
| `Black`               | No                     | $0              | −$1        |
| `Low (1–18)`          | Yes (18 in range)      | $2              | +$1        |
| `High (19–36)`        | No                     | $0              | −$1        |
| `2 to 1 1st Row`      | Yes (column contains 18)| $3             | +$2        |
| `2 to 1 2nd Row`      | No                     | $0              | −$1        |
| `2nd 12`              | Yes (13–24)            | $3              | +$2        |
| `Split 17-18`         | Yes (split)            | $18             | +$17       |
| `Five-Number 0-00-1-2-3`* | No (18 not covered)    | $0          | −$1        |
| `Line 13-14-15-16-17-18` | Yes (line of six)   | $6              | +$5        |

`*` The five-number example reflects how any five-number combination would be evaluated; if the winning number is outside the set, the bet loses.

These payouts align with standard roulette odds, except all returns are quoted as *stake-inclusive* because the implementation multiplies the wager by the shown factor when a bet wins. Adjust the amounts proportionally for wagers higher than $1.

