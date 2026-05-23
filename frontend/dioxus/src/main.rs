mod app;
mod components;
mod types;
mod views;

use app::App;

fn main() {
    dioxus::launch(App);
}
