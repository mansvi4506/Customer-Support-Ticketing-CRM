const API = "/api";

const $ = (selector) => document.querySelector(selector);

let allTickets = [];

document.addEventListener("DOMContentLoaded", () => {
  loadTickets();

  $("#searchInput").addEventListener("input", loadTickets);
  $("#statusFilter").addEventListener("change", loadTickets);
  $("#newTicketBtn").addEventListener("click", () => openModal("createModal"));
  $("#createForm").addEventListener("submit", createTicket);

  document.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-close]");
    if (closeTarget) closeModal(closeTarget.dataset.close);

    const ticketButton = event.target.closest("[data-ticket]");
    if (ticketButton) openTicket(ticketButton.dataset.ticket);
  });
});


/* =========================
   LOAD TICKETS
========================= */

async function loadTickets() {
  const search = $("#searchInput").value.trim();
  const status = $("#statusFilter").value;

  const params = new URLSearchParams();

  if (search) params.set("search", search);
  if (status) params.set("status", status);

  try {
    const response = await fetch(`${API}/tickets?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Unable to load tickets.");
    }

    const tickets = await response.json();

    allTickets = tickets;

    renderTickets(tickets);

    // Dashboard statistics intentionally uses one unfiltered request.
    const statsResponse = await fetch(`${API}/tickets`);

    if (statsResponse.ok) {
      updateStats(await statsResponse.json());
    }

  } catch (error) {
    showTableError(error.message);
  }
}


/* =========================
   RENDER TICKETS
========================= */

function renderTickets(tickets) {
  $("#ticketCount").textContent =
    `${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}`;

  if (!tickets.length) {
    $("#tableWrap").classList.add("hidden");
    $("#tableState").classList.remove("hidden");

    $("#tableState").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⌕</div>
        <h3>No tickets found</h3>
        <p>Try changing your search or status filter.</p>
      </div>
    `;

    return;
  }

  $("#tableState").classList.add("hidden");
  $("#tableWrap").classList.remove("hidden");

  $("#ticketRows").innerHTML = tickets.map((ticket) => `
    <tr>

      <td>
        <button
          class="ticket-id"
          data-ticket="${escapeAttr(ticket.ticket_id)}"
        >
          ${escapeHtml(ticket.ticket_id)}
        </button>
      </td>

      <td>
        <div class="customer-cell">

          <div class="avatar">
            ${initials(ticket.customer_name)}
          </div>

          <div>
            <strong>
              ${escapeHtml(ticket.customer_name)}
            </strong>

            <span>
              ${escapeHtml(ticket.customer_email)}
            </span>
          </div>

        </div>
      </td>

      <td>
        <button
          class="issue-link"
          data-ticket="${escapeAttr(ticket.ticket_id)}"
        >
          ${escapeHtml(ticket.subject)}
        </button>
      </td>

      <td>
        <span class="status ${statusClass(ticket.status)}">
          ${escapeHtml(ticket.status)}
        </span>
      </td>

      <td class="date-cell">
        ${formatDate(ticket.created_at)}
      </td>

      <td>
        <button
          class="view-btn"
          data-ticket="${escapeAttr(ticket.ticket_id)}"
        >
          View →
        </button>
      </td>

    </tr>
  `).join("");
}


/* =========================
   DASHBOARD STATISTICS
========================= */

function updateStats(tickets) {
  const open = tickets.filter(t => t.status === "Open").length;
  const progress = tickets.filter(t => t.status === "In Progress").length;
  const closed = tickets.filter(t => t.status === "Closed").length;

  $("#statTotal").textContent = tickets.length;

  $("#statOpen").textContent = open;
  $("#statProgress").textContent = progress;
  $("#statClosed").textContent = closed;

  updateAnalytics({ total: tickets.length, open, progress, closed });
}


/* =========================
   LIVE ANALYTICS
========================= */

function updateAnalytics({ total, open, progress, closed }) {
  const chart = $("#ticketDistributionChart");

  $("#analyticsTotal").textContent = total;
  $("#analyticsOpen").textContent = open;
  $("#analyticsProgress").textContent = progress;
  $("#analyticsClosed").textContent = closed;

  const openEnd = total ? (open / total) * 100 : 0;
  const progressEnd = openEnd + (total ? (progress / total) * 100 : 0);

  chart.style.setProperty("--open-end", `${openEnd}%`);
  chart.style.setProperty("--progress-end", `${progressEnd}%`);
  chart.setAttribute(
    "aria-label",
    `Ticket status distribution: ${open} open, ${progress} in progress, ${closed} closed`
  );
}


/* =========================
   CREATE TICKET
========================= */

async function createTicket(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');

  const data = Object.fromEntries(
    new FormData(form).entries()
  );

  submit.disabled = true;
  submit.textContent = "Creating…";

  try {
    const response = await fetch(`${API}/tickets`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.detail || "Could not create ticket."
      );
    }

    form.reset();

    closeModal("createModal");

    showToast(
      `${result.ticket_id} created successfully.`
    );

    await loadTickets();

    openTicket(result.ticket_id);

  } catch (error) {

    showToast(error.message, true);

  } finally {

    submit.disabled = false;
    submit.textContent = "Create ticket";

  }
}


/* =========================
   OPEN TICKET
========================= */

async function openTicket(ticketId) {

  openModal("detailModal");

  $("#detailId").textContent = ticketId;

  $("#detailSubject").textContent = "Loading…";

  $("#detailContent").innerHTML = `
    <div class="loading-state">
      Loading ticket…
    </div>
  `;

  try {

    const response = await fetch(
      `${API}/tickets/${encodeURIComponent(ticketId)}`
    );

    const ticket = await response.json();

    if (!response.ok) {
      throw new Error(
        ticket.detail || "Ticket not found."
      );
    }

    $("#detailId").textContent = ticket.ticket_id;

    $("#detailSubject").textContent = ticket.subject;


    $("#detailContent").innerHTML = `

      <div class="detail-grid">

        <div class="detail-main">

          <!-- CUSTOMER -->

          <div class="detail-section">

            <div class="section-label">
              Customer
            </div>

            <div class="customer-detail">

              <div class="avatar large">
                ${initials(ticket.customer_name)}
              </div>

              <div>

                <strong>
                  ${escapeHtml(ticket.customer_name)}
                </strong>

                <a
                  href="mailto:${escapeAttr(ticket.customer_email)}"
                >
                  ${escapeHtml(ticket.customer_email)}
                </a>

              </div>

            </div>

          </div>


          <!-- DESCRIPTION -->

          <div class="detail-section">

            <div class="section-label">
              Description
            </div>

            <p class="description">
              ${escapeHtml(ticket.description)}
            </p>

          </div>


          <!-- NOTES -->

          <div class="detail-section">

            <div class="section-label">
              Notes & activity
            </div>

            <div class="notes-list">

              ${
                ticket.notes.length
                  ? ticket.notes.map(note => `

                    <div class="note">

                      <div class="note-dot"></div>

                      <div>

                        <p>
                          ${escapeHtml(note.note_text)}
                        </p>

                        <time>
                          ${formatDate(note.created_at)}
                        </time>

                      </div>

                    </div>

                  `).join("")

                  : `
                    <div class="no-notes">
                      No notes yet. Add the first update below.
                    </div>
                  `
              }

            </div>

          </div>

        </div>


        <!-- RIGHT SIDE -->

        <div class="detail-side">

          <div class="side-card">

            <div class="section-label">
              Status
            </div>

            <select id="detailStatus">

              <option
                value="Open"
                ${ticket.status === "Open" ? "selected" : ""}
              >
                Open
              </option>

              <option
                value="In Progress"
                ${ticket.status === "In Progress" ? "selected" : ""}
              >
                In Progress
              </option>

              <option
                value="Closed"
                ${ticket.status === "Closed" ? "selected" : ""}
              >
                Closed
              </option>

            </select>


            <div class="meta-row">

              <span>
                Created
              </span>

              <strong>
                ${formatDate(ticket.created_at)}
              </strong>

            </div>


            <div class="meta-row">

              <span>
                Last updated
              </span>

              <strong>
                ${formatDate(ticket.updated_at)}
              </strong>

            </div>


            <label class="note-input">

              Add a note

              <textarea
                id="detailNote"
                rows="4"
                placeholder="Write an internal update…"
              ></textarea>

            </label>


            <button
              class="primary-btn full"
              id="saveTicketBtn"
            >
              Save changes
            </button>

          </div>

        </div>

      </div>

    `;


    $("#saveTicketBtn").addEventListener(
      "click",
      () => saveTicket(ticket.ticket_id)
    );


  } catch (error) {

    $("#detailContent").innerHTML = `
      <div class="error-box">
        ${escapeHtml(error.message)}
      </div>
    `;

  }
}


/* =========================
   SAVE / CLOSE TICKET
========================= */

async function saveTicket(ticketId) {
  const button = $("#saveTicketBtn");

  // Get the status selected by the USER
  const status = $("#detailStatus").value;

  // Get optional note
  const notes = $("#detailNote").value.trim();

  button.disabled = true;
  button.textContent = "Saving…";

  try {
    const response = await fetch(
      `${API}/tickets/${encodeURIComponent(ticketId)}`,
      {
        method: "PUT",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          status: status,
          notes: notes
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.detail || "Could not update ticket."
      );
    }

    // Refresh dashboard and ticket list
    await loadTickets();

    // Close the ticket detail panel
    closeModal("detailModal");

    // Tell the user exactly what happened
    showToast(
      `${ticketId} updated to ${status}.`
    );

  } catch (error) {

    showToast(
      error.message,
      true
    );

    button.disabled = false;
    button.textContent = "Save changes";
  }
}


/* =========================
   MODALS
========================= */

function openModal(id) {

  $(`#${id}`).classList.remove("hidden");

  document.body.classList.add("modal-open");
}


function closeModal(id) {

  $(`#${id}`).classList.add("hidden");

  document.body.classList.remove("modal-open");
}


/* =========================
   STATUS CSS CLASS
========================= */

function statusClass(status) {

  return status
    .toLowerCase()
    .replaceAll(" ", "-");

}


/* =========================
   CUSTOMER INITIALS
========================= */

function initials(name) {

  return name
    .split(" ")
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

}


/* =========================
   DATE FORMAT
========================= */

function formatDate(value) {

  if (!value) return "—";

  const date = new Date(value);

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(date);

}


/* =========================
   HTML ESCAPING
========================= */

function escapeHtml(value) {

  return String(value).replace(
    /[&<>"']/g,

    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

}


function escapeAttr(value) {

  return escapeHtml(value);

}


/* =========================
   TABLE ERROR
========================= */

function showTableError(message) {

  $("#tableWrap").classList.add("hidden");

  $("#tableState").classList.remove("hidden");

  $("#tableState").innerHTML = `

    <div class="empty-state">

      <div class="empty-icon">
        !
      </div>

      <h3>
        Something went wrong
      </h3>

      <p>
        ${escapeHtml(message)}
      </p>

      <button
        class="secondary-btn"
        onclick="loadTickets()"
      >
        Retry
      </button>

    </div>

  `;
}


/* =========================
   TOAST
========================= */

let toastTimer;

function showToast(message, isError = false) {

  const toast = $("#toast");

  toast.textContent = message;

  toast.className =
    `toast show ${isError ? "error" : ""}`;

  clearTimeout(toastTimer);

  toastTimer = setTimeout(
    () => {
      toast.className = "toast";
    },
    3500
  );

}
