/**
 * Shared rules section for Practice and P2P game setup pages.
 * Same 3 cards: stake sats, chain rewards, reset/respawn.
 */
export function RulesSection() {
  return (
    <div id="centerSection">
      <div id="gameCard">
        <p className="ruleTitle">1. Stake your sats</p>
        <p className="gameDescription grey">
          Deposit your sats, play, redeem.
        </p>
        <p className="gameDescription grey">
          Cycle ends when one chain hits zero sats.
        </p>
        <p className="gameDescription grey">
          Double or nothing to up the stakes.
        </p>
        <p className="gameDescription grey">Winner takes all!</p>
      </div>
      <div id="gameCard">
        <p className="ruleTitle">2. Longer chains collect more sats</p>
        <p className="gameDescription grey">
          Capture coinbases to grow your chain and collect more value.
        </p>
        <div>
          <table className="gameDescription grey rewards">
            <tbody>
              <tr>
                <td className="reward-blocks">Chain Length</td>
                <td className="reward-percent">
                  <b>Reward</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">2 blocks</td>
                <td className="reward-percent">
                  <b>2%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">3 blocks</td>
                <td className="reward-percent">
                  <b>4%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">5 blocks</td>
                <td className="reward-percent">
                  <b>8%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">8 blocks</td>
                <td className="reward-percent">
                  <b>16%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">12+ blocks</td>
                <td className="reward-percent">
                  <b>32%</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div id="gameCard">
        <p className="ruleTitle">3. Reset/respawn</p>
        <p className="gameDescription grey">
          Avoid mistakes or risk losing your proof-of-work.
        </p>
        <p className="gameDescription grey">
          Hitting walls or the other chain resets to genesis block.
        </p>
        <p className="gameDescription grey">
          Head-to-head collisions reset both chains.
        </p>
      </div>
    </div>
  );
}
