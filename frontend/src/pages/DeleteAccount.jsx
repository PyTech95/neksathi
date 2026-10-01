import React from "react";

export default function DeleteAccount() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#07070D",
        color: "#E8E8F5",
        padding: "60px 20px",
      }}
    >
      <article
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          background: "#0D0D1A",
          border: "1px solid rgba(139,92,246,.30)",
          borderRadius: "24px",
          padding: "32px",
          lineHeight: "1.7",
        }}
      >
        <h1>Delete Your NekSathi Account</h1>

        <p>
          You may request permanent deletion of your NekSathi account
          and associated personal data.
        </p>

        <h2>How to request deletion</h2>

        <p>
          Open the NekSathi app and go to:
        </p>

        <p>
          <strong>
            Profile → Privacy & Account → Delete Account
          </strong>
        </p>

        <p>
          Follow the instructions shown on the account deletion page to
          request deletion of your account.
        </p>

        <h2>What will be deleted?</h2>

        <p>
          After verification, we will process deletion of your account and
          personal information associated with your NekSathi account,
          subject to information that may need to be retained for legitimate
          legal, security, fraud-prevention or regulatory requirements.
        </p>

        <p>
          Depending on your use of NekSathi, deleted information may include:
        </p>

        <ul>
          <li>Account profile information</li>
          <li>Name and phone information associated with the account</li>
          <li>Vehicle and Smart QR account information</li>
          <li>Family safety information associated with the account</li>
          <li>Profile information</li>
          <li>Account preferences</li>
          <li>Other personal information linked to the account</li>
        </ul>

        <h2>Information that may be retained</h2>

        <p>
          Some information may be retained where necessary for legal
          obligations, fraud prevention, security investigations, dispute
          resolution or other legitimate regulatory requirements.
        </p>

        <h2>Account deletion processing</h2>

        <p>
          Account deletion requests may require verification to help prevent
          unauthorized deletion of another user's account.
        </p>

        <p>
          Once verified and processed, access to the deleted NekSathi
          account may no longer be available.
        </p>

        <h2>Privacy Policy</h2>

        <p>
          For more information about how NekSathi processes personal
          information, please review our{" "}
          <a
            href="/privacy"
            style={{
              color: "#22D3EE",
              textDecoration: "none",
              fontWeight: "700",
            }}
          >
            Privacy Policy
          </a>
          .
        </p>

        <h2>Operator</h2>

        <p>
          NekSathi
          <br />
          Operated by{" "}
          <a
            href="https://pytechdigital.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#22D3EE",
              textDecoration: "none",
              fontWeight: "700",
            }}
          >
            PyTech
          </a>
        </p>
      </article>
    </main>
  );
}
