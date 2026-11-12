/**
 * A rewarded ad a site can offer (each sdk.*.ts has a `rewardedOffer`). When the player falls, the game asks for one; if one is
 * ready it offers it (UI.reviveOffer), and the player either watches it (`watch()` resolves true when it was watched to the end:
 * the reward is earned) or says no (`skip()`). A site with no rewarded ads returns null, and the game goes on as it always has.
 */
export interface Rewarded {
  watch(): Promise<boolean>;
  skip(): void;
}
