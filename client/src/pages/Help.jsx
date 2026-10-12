import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, KeyRound, HandCoins, Gauge, WifiOff, ShieldAlert } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useI18n } from '../context/I18nContext.jsx';

/**
 * How Madad works.
 *
 * This exists because the product rests on a mechanism people have not seen
 * before: there is no escrow, and nothing holds the money. A user who does
 * not understand that will either distrust the app or — worse — assume a
 * protection that is not there. Explaining it once, plainly, is cheaper than
 * every support conversation that follows from not explaining it.
 *
 * The limitations section is not a disclaimer bolted on at the end. It is the
 * part most worth reading, and it is deliberately not softened.
 */

function Section({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-ink-50 transition-colors"
      >
        <span className="shrink-0 w-9 h-9 rounded-xl bg-brand-50 grid place-items-center">
          <Icon size={17} className="text-brand-600" />
        </span>
        <span className="flex-1 font-display font-bold text-[14.5px] text-ink-900">{title}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-[12.5px] text-ink-600 leading-relaxed space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Help() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <PageHeader title={t('nav.help')} />

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="card p-4 bg-brand-700 border-brand-700 text-white">
          <h2 className="font-display font-extrabold text-lg">Madad in one line</h2>
          <p className="text-[13px] text-brand-50 leading-relaxed mt-1.5">
            Post a small errand with a cash bounty. Someone nearby does it. You pay them directly
            over UPI — Madad never touches the money, takes no commission, and charges no fee.
          </p>
        </div>

        <Section icon={HandCoins} title="How a task works, start to finish" defaultOpen>
          <p>
            <strong className="text-ink-800 font-semibold">You post.</strong> Describe the errand,
            set a bounty between ₹10 and ₹500, and it appears on the feed of people near you.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">Someone accepts.</strong> Only one person
            can — the claim is atomic, so two volunteers can never both be sent to the same job. A
            private chat opens between the two of you.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">You meet.</strong> Your screen shows a
            4-digit code. They type it into their phone. That is what marks the task delivered.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">You pay.</strong> A UPI QR code appears
            with the amount and their ID filled in. You pay from your own UPI app, straight to their
            bank.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">Both confirm.</strong> You tap "I have
            paid"; they tap "I received it". Only when both agree does the task settle and trust
            scores move.
          </p>
        </Section>

        <Section icon={KeyRound} title="Why there is a 4-digit code">
          <p>
            Because otherwise anyone could mark a task done from their bedroom. The code is
            generated when the task is claimed and shown only to the person who posted it. You
            cannot type in a code you were never shown — so entering it successfully proves the two
            of you were actually standing in the same place.
          </p>
        </Section>

        <Section icon={Gauge} title="What the trust score is for">
          <p>
            It is the whole enforcement mechanism. There is no escrow holding anyone's money, so
            what replaces it is reputation: paying on time earns points, abandoning a task you
            claimed costs 15, failing to pay costs 25. Below 40 an account can no longer post or
            claim anything.
          </p>
          <p>
            Gains have diminishing returns — climbing from 90 to 100 is far harder than 50 to 60 —
            so the score stays meaningful instead of everyone reaching the top in a week.
          </p>
        </Section>

        <Section icon={WifiOff} title="What works without internet">
          <p>
            Browsing the feed you last loaded, and posting a task — it queues on your phone and goes
            out the moment you are back online, without ever posting twice.
          </p>
          <p>
            What cannot work offline: seeing other people's new tasks, accepting a task (that needs
            the server to lock it), and chat. That is a limit of the design, not an oversight.
          </p>
        </Section>

        {/*
          The honest part. Naming these yourself is a far stronger position
          than having a user discover them.
        */}
        <Section icon={ShieldAlert} title="What Madad does not do">
          <p>
            <strong className="text-ink-800 font-semibold">It does not verify identity.</strong>{' '}
            Anyone can sign up with any email address. The trust score shows how someone has
            behaved here; it is not proof of who they are.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">It cannot stop non-payment.</strong>{' '}
            Without escrow, someone can simply not pay. They lose 25 trust points and get restricted
            after two offences — but you will not have been paid. This works in a community where
            people meet repeatedly; it would not work between strangers at high value.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">
              It does not see your bank transaction.
            </strong>{' '}
            Settlement relies on both of you telling the truth about a payment that happened outside
            the app.
          </p>
          <p>
            <strong className="text-ink-800 font-semibold">It is not a safety service.</strong>{' '}
            Read the <Link to="/safety" className="text-brand-600 font-semibold underline">safety page</Link>{' '}
            before meeting anyone. The SOS button alerts people — it does not call the police.
          </p>
        </Section>

        <div className="card p-4">
          <h3 className="font-display font-bold text-[14.5px] text-ink-900 mb-2">
            Why is the bounty capped at ₹500?
          </h3>
          <p className="text-[12.5px] text-ink-600 leading-relaxed">
            Deliberately. The reputation model only holds for amounts people will shrug off once.
            Raising the cap would invite exactly the high-value transactions between strangers that
            this design cannot protect.
          </p>
        </div>

        <p className="text-[11px] text-ink-400 leading-relaxed px-1 pb-4">
          Madad holds no money and needs no payment licence, which is why there is no commission.
          Bounties move bank to bank over UPI.
        </p>
      </div>
    </div>
  );
}
