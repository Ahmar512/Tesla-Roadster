// Store services: rewarded ads, leaderboards and achievements.
//
// TODO(phase 7): back this with AdMob (rewarded ads) and Google Play Games
// Services (leaderboard + achievements) through their Capacitor plugins.
// Until then the web build has no ads, and dev builds show a placeholder ad
// so the revive and double-cells flows can be tested.

export interface Platform {
  readonly adsAvailable: boolean;
  /** Resolves true if the player watched to the end and earned the reward. */
  showRewardedAd(): Promise<boolean>;
  submitScore(score: number): void;
  unlockAchievement(id: string): void;
}

const PLACEHOLDER_AD_SECONDS = 3;

class WebPlatform implements Platform {
  readonly adsAvailable = import.meta.env.DEV || new URLSearchParams(location.search).has('ads');

  showRewardedAd() {
    if (!this.adsAvailable) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const el = document.createElement('div');
      el.className = 'fake-ad';
      el.innerHTML = `<div class="fake-ad-tag">AD</div><div>Rewarded ad placeholder</div><small>Real ads arrive with the Android build</small><button class="btn btn-small" disabled>${PLACEHOLDER_AD_SECONDS}</button>`;
      document.body.appendChild(el);
      const button = el.querySelector('button')!;
      let left = PLACEHOLDER_AD_SECONDS;
      const timer = setInterval(() => {
        left--;
        if (left > 0) {
          button.textContent = String(left);
          return;
        }
        clearInterval(timer);
        button.textContent = 'CLAIM REWARD';
        button.disabled = false;
      }, 1000);
      button.addEventListener('click', () => {
        el.remove();
        resolve(true);
      });
    });
  }

  submitScore() {}

  unlockAchievement() {}
}

export const platform: Platform = new WebPlatform();
